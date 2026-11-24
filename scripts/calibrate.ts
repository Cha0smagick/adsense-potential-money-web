import { readFile, writeFile } from 'node:fs/promises';
import { xorshift32 } from '../src/core/sample.ts';
import { normalizeUrl } from '../src/core/normalize.ts';

// Calibración case-control con dos fuentes:
//  - Positivos: sitios de Tranco que hoy sirven AdSense + aprobaciones autodeclaradas de Reddit.
//  - Negativos: rechazos de Reddit y del foro que siguen sin AdSense.
// Los foros no son una cohorte representativa: se estima el LR, no la prevalencia.

interface Row {
  url?: string;
  site?: string;
  host?: string;
  score?: number;
  outcome?: string;
  adsense?: boolean;
  stale?: boolean;
  reachable?: boolean;
  gates?: string[];
  words?: number;
}

const SHARED = /\.(blogspot\.[a-z.]+|wordpress\.com|github\.io|gitlab\.io|netlify\.app|vercel\.app|pages\.dev|web\.app|wixsite\.com|weebly\.com|tumblr\.com|substack\.com|medium\.com)$/;

function keyOf(site: string): string | null {
  try {
    const n = normalizeUrl(site);
    return SHARED.test(n.host) ? n.host : n.registrable;
  } catch {
    return null;
  }
}

function readJson(path: string): Promise<Row[]> {
  return readFile(path, 'utf8').then((s) => JSON.parse(s) as Row[]).catch(() => []);
}

const tranco = (await readJson('data/raw/tranco-scan.json')).filter(
  (r) => r.adsense === true && typeof r.score === 'number' && r.url,
);
const reddit = await readJson('data/raw/reddit-measured.json');
const forum = await readJson('data/raw/negatives-measured.json');

const posMap = new Map<string, { url: string; score: number; source: string }>();
for (const r of tranco) {
  const key = keyOf(r.url as string);
  if (key && !posMap.has(key)) posMap.set(key, { url: r.url as string, score: r.score as number, source: 'tranco' });
}
for (const r of reddit) {
  if (r.outcome !== 'approved' || !r.reachable || typeof r.score !== 'number') continue;
  const site = r.url ?? r.site;
  const key = site ? keyOf(site) : null;
  if (key && !posMap.has(key)) posMap.set(key, { url: site as string, score: r.score, source: 'reddit' });
}

const negMap = new Map<string, { url: string; score: number; source: string }>();
const staleKeys = new Set<string>();
for (const r of reddit) {
  if (r.outcome !== 'rejected') continue;
  const site = r.url ?? r.site;
  const key = site ? keyOf(site) : null;
  if (!key) continue;
  if (r.stale || r.adsense) staleKeys.add(key);
  if (!r.reachable || r.stale || (r.gates ?? []).includes('unreachable') || !(r.words && r.words > 0)) continue;
  if (!negMap.has(key)) negMap.set(key, { url: site as string, score: r.score as number, source: 'reddit' });
}
for (const r of forum) {
  const site = r.url ?? r.site;
  const key = site ? keyOf(site) : null;
  if (!key) continue;
  if (r.stale) { staleKeys.add(key); continue; }
  if (!r.reachable || (r.gates ?? []).includes('unreachable') || !(r.words && r.words > 0) || typeof r.score !== 'number') continue;
  if (!negMap.has(key)) negMap.set(key, { url: site as string, score: r.score, source: 'forum' });
}

for (const key of posMap.keys()) negMap.delete(key);

const pos = Array.from(posMap.values()).map((p) => p.score);
const neg = Array.from(negMap.values()).map((n) => n.score);

function auc(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0.5;
  let u = 0;
  for (const x of a) for (const y of b) u += x > y ? 1 : x === y ? 0.5 : 0;
  return u / (a.length * b.length);
}

function quantile(sorted: number[], q: number): number {
  const p = (sorted.length - 1) * q;
  const base = Math.floor(p);
  const rest = p - base;
  return base + 1 < sorted.length ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function bootstrapAuc(a: number[], b: number[], iterations = 3000): { low: number; high: number } {
  if (a.length < 5 || b.length < 5) return { low: 0, high: 1 };
  const rand = xorshift32(20261124);
  const values: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const ra = Array.from({ length: a.length }, () => a[Math.floor(rand() * a.length)]);
    const rb = Array.from({ length: b.length }, () => b[Math.floor(rand() * b.length)]);
    values.push(auc(ra, rb));
  }
  values.sort((x, y) => x - y);
  return { low: quantile(values, 0.005), high: quantile(values, 0.995) };
}

const BANDS = [
  { id: '<50', min: 0, max: 50 },
  { id: '50-70', min: 50, max: 70 },
  { id: '70-85', min: 70, max: 85 },
  { id: '85-100', min: 85, max: 100.01 },
];
const ANCHORS: [number, number][] = [[0, 0.02], [40, 0.07], [55, 0.18], [70, 0.45], [85, 0.72], [95, 0.8], [100, 0.85]];
function priorAt(x: number): number {
  if (x <= ANCHORS[0][0]) return ANCHORS[0][1];
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x1, y1] = ANCHORS[i - 1];
    const [x2, y2] = ANCHORS[i];
    if (x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return ANCHORS[ANCHORS.length - 1][1];
}
function bandLr(a: number[], b: number[], band: { min: number; max: number }): number {
  const pa = a.filter((s) => s >= band.min && s < band.max).length;
  const pb = b.filter((s) => s >= band.min && s < band.max).length;
  return ((pa + 0.5) / (a.length + 1)) / ((pb + 0.5) / (b.length + 1));
}

const rawAuc = auc(pos, neg);
const ci = bootstrapAuc(pos, neg);
const status = neg.length >= 250 && ci.low > 0.6
  ? 'weak'
  : neg.length >= 60 && ci.low > 0.55
    ? 'pilot'
    : 'failed';

const bands = BANDS.map((band) => {
  const pa = pos.filter((s) => s >= band.min && s < band.max).length;
  const pb = neg.filter((s) => s >= band.min && s < band.max).length;
  const lr = bandLr(pos, neg, band);
  const rand = xorshift32(20261124);
  const lrs: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const ra = Array.from({ length: pos.length }, () => pos[Math.floor(rand() * pos.length)]);
    const rb = Array.from({ length: neg.length }, () => neg[Math.floor(rand() * neg.length)]);
    lrs.push(bandLr(ra, rb, band));
  }
  lrs.sort((x, y) => x - y);
  const mid = (band.min + Math.min(band.max, 100)) / 2;
  const prior = priorAt(mid);
  const shrink = status === 'weak' ? 0.7 : 0.4;
  const posterior = (() => {
    const odd = (prior / (1 - prior)) * Math.pow(lr, shrink);
    return odd / (1 + odd);
  })();
  return {
    id: band.id,
    min: band.min,
    max: Math.min(band.max, 100),
    pos: pa,
    neg: pb,
    lr: Math.round(lr * 100) / 100,
    lrLow: Math.round(quantile(lrs, 0.005) * 100) / 100,
    lrHigh: Math.round(quantile(lrs, 0.995) * 100) / 100,
    prior: Math.round(prior * 1000) / 1000,
    posterior: Math.round(posterior * 1000) / 1000,
  };
});

const median = (v: number[]) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : null);
const requiredPerClass = Math.ceil((2.576 / 0.05) ** 2 / 6);
const positiveFloor = (() => {
  if (!pos.length) return null;
  const sorted = pos.slice().sort((a, b) => a - b);
  return {
    value: sorted[0],
    n: pos.length,
    confidence: Math.round((1 - Math.pow(0.95, pos.length)) * 1000) / 1000,
    target: 0.95,
  };
})();

const data = {
  status,
  collectedAt: new Date().toISOString().slice(0, 10),
  n: pos.length + neg.length,
  approved: pos.length,
  rejected: neg.length,
  staleRejected: staleKeys.size,
  auc: Math.round(rawAuc * 1000) / 1000,
  aucLow: Math.round(ci.low * 1000) / 1000,
  aucHigh: Math.round(ci.high * 1000) / 1000,
  requiredPerClass,
  medianApproved: median(pos),
  medianRejected: median(neg),
  positiveFloor,
  bands,
  note:
    `Case-control: ${pos.length} aprobados (Tranco con AdSense + Reddit autodeclarado) y ${neg.length} rechazos que siguen sin AdSense. ` +
    `AUC ${rawAuc.toFixed(2)} (IC99 ${ci.low.toFixed(2)}–${ci.high.toFixed(2)}). ` +
    `Etiquetas autodeclaradas y muestra no representativa: se estima el LR, no la prevalencia real. ` +
    `Rechazos descartados por ya mostrar anuncios: ${staleKeys.size}.`,
  dataset: './data/approval-cases.json',
  measured: './data/reddit-measured.json',
  report: './data/calibration.md',
  method:
    'Positivos: Tranco con ca-pub/adsbygoogle + posts de r/Adsense que declaran aprobación. Negativos: posts de r/Adsense y del foro que declaran rechazo y hoy no muestran AdSense. ' +
    'Medición con el motor rápido; LR por banda con suavizado de Laplace y bootstrap 99%.',
};

const ts = `// Generado por scripts/calibrate.ts el ${data.collectedAt}. No editar a mano.
export type CalibrationStatus = 'unvalidated' | 'pilot' | 'weak' | 'validated' | 'failed';
export interface CalibrationBand {
  id: string; min: number; max: number; pos: number; neg: number;
  lr: number; lrLow: number; lrHigh: number; prior: number; posterior: number;
}
export interface PublicCalibrationData {
  status: CalibrationStatus; collectedAt: string; n: number; approved: number; rejected: number;
  staleRejected: number; auc: number | null; aucLow: number | null; aucHigh: number | null;
  requiredPerClass: number; medianApproved: number | null; medianRejected: number | null;
  positiveFloor: { value: number; n: number; confidence: number; target: number } | null;
  bands: CalibrationBand[]; note: string; dataset: string; measured: string; report: string; method: string;
}
export const CALIBRATION: PublicCalibrationData = ${JSON.stringify(data, null, 2)};
`;

await writeFile('src/data/calibration.ts', ts, 'utf8');
await writeFile('data/calibration-latest.json', JSON.stringify(data, null, 2), 'utf8');

const md = `# Calibración pública (case-control)\n\n` +
  `Generado: ${data.collectedAt}\n\n` +
  `| Métrica | Valor |\n|---|---|\n` +
  `| Aprobados | ${pos.length} (Tranco + Reddit) |\n` +
  `| Rechazos válidos | ${neg.length} |\n` +
  `| Rechazos descartados por ya tener anuncios | ${staleKeys.size} |\n` +
  `| AUC | ${data.auc} (IC99 ${data.aucLow}–${data.aucHigh}) |\n` +
  `| Mediana aprobados | ${data.medianApproved} |\n` +
  `| Mediana rechazados | ${data.medianRejected} |\n` +
  `| 95 % de aprobados ≥ | ${positiveFloor?.value ?? '—'} (n=${positiveFloor?.n ?? 0}, confianza ${positiveFloor ? (positiveFloor.confidence * 100).toFixed(1) : '—'} %) |\n` +
  `| Muestra por clase para IC99 ±0,05 en AUC | ${requiredPerClass} |\n\n` +
  `| Banda | Pos | Neg | LR | IC99 LR | Prior | Posterior |\n|---|---:|---:|---:|---|---:|---:|\n` +
  bands.map((b) => `| ${b.id} | ${b.pos} | ${b.neg} | ${b.lr} | ${b.lrLow}–${b.lrHigh} | ${b.prior} | ${b.posterior} |`).join('\n') +
  `\n\n${data.note}\n`;
await writeFile('data/calibration-latest.md', md, 'utf8');

console.log(JSON.stringify(data, null, 2));
