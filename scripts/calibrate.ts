import { readFile, writeFile } from 'node:fs/promises';
import { xorshift32 } from '../src/core/sample.ts';

// Calibración case-control: positivos = sitios que hoy sirven AdSense;
// negativos = rechazos públicos que siguen sin AdSense. El LR por banda se
// combina con el prior del producto; la prevalencia de la muestra NO es la real.

interface Row {
  url?: string;
  site?: string;
  domain?: string;
  score?: number;
  adsense?: boolean;
  stale?: boolean;
  reachable?: boolean;
  outcome?: string;
  gates?: string[];
  words?: number;
}

const positives = (JSON.parse(await readFile('data/raw/tranco-scan.json', 'utf8').catch(() => '[]')) as Row[])
  .filter((r) => r.adsense === true && typeof r.score === 'number' && r.url)
  .map((r) => ({ url: r.url as string, score: r.score as number }));

const allNegatives = (JSON.parse(await readFile('data/raw/negatives-measured.json', 'utf8').catch(() => '[]')) as Row[])
  .filter((r) => (r.url || r.site) && typeof r.score === 'number');
const negatives = allNegatives
  .filter(
    (r) =>
      r.reachable &&
      !r.stale &&
      r.outcome !== 'approved' &&
      !(r.gates ?? []).includes('unreachable') &&
      typeof r.words === 'number' &&
      r.words > 0,
  )
  .map((r) => ({ url: (r.url ?? r.site) as string, score: r.score as number }));

const posHosts = new Set(positives.map((p) => new URL(p.url).hostname.replace(/^www\./, '')));
const cleanNegatives = negatives.filter((n) => !posHosts.has(new URL(n.url).hostname.replace(/^www\./, '')));

const pos = positives.map((p) => p.score);
const neg = cleanNegatives.map((n) => n.score);

function auc(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0.5;
  let u = 0;
  for (const x of a) for (const y of b) u += x > y ? 1 : x === y ? 0.5 : 0;
  return u / (a.length * b.length);
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return base + 1 < sorted.length ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function bootstrapAuc(a: number[], b: number[], iterations = 2000): { low: number; high: number } {
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
const status = cleanNegatives.length >= 300 && ci.low > 0.6
  ? 'validated'
  : cleanNegatives.length >= 50 && ci.low > 0.55
    ? 'weak'
    : cleanNegatives.length >= 15
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
  const shrink = status === 'validated' ? 1 : status === 'weak' ? 0.7 : 0.4;
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
const stale = allNegatives.filter((r) => r.stale).length;
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
  n: pos.length + cleanNegatives.length,
  approved: pos.length,
  rejected: cleanNegatives.length,
  staleRejected: stale,
  auc: Math.round(rawAuc * 1000) / 1000,
  aucLow: Math.round(ci.low * 1000) / 1000,
  aucHigh: Math.round(ci.high * 1000) / 1000,
  requiredPerClass,
  medianApproved: median(pos),
  medianRejected: median(neg),
  positiveFloor,
  bands,
  note:
    `Muestra case-control: ${pos.length} sitios que hoy sirven AdSense y ${cleanNegatives.length} rechazos públicos que siguen sin AdSense. ` +
    `AUC ${rawAuc.toFixed(2)} (IC99 ${ci.low.toFixed(2)}–${ci.high.toFixed(2)}). ` +
    `La prevalencia de la muestra no es la real; el LR por banda se combina con el prior del producto. ` +
    (positiveFloor ? `Umbral observado: el 95% de los aprobados puntúa ≥${positiveFloor.value} (n=${positiveFloor.n}, confianza ${(positiveFloor.confidence * 100).toFixed(1)}%).` : ''),
  dataset: './data/approval-cases.json',
  measured: './data/negatives-measured.json',
  report: './data/calibration.md',
  method:
    'Positivos: muestra aleatoria de Tranco con código de AdSense en el HTML. Negativos: rechazos públicos del foro de AdSense con URL, medidos hoy y excluyendo los que ya muestran anuncios. ' +
    'LR por banda con suavizado de Laplace y bootstrap 99%.',
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
  `| Positivos (AdSense hoy) | ${pos.length} |\n` +
  `| Negativos (rechazo, sin AdSense) | ${cleanNegatives.length} |\n` +
  `| Rechazos excluidos por ya tener anuncios | ${stale} |\n` +
  `| AUC | ${data.auc} (IC99 ${data.aucLow}–${data.aucHigh}) |\n` +
  `| Mediana aprobados | ${data.medianApproved} |\n` +
  `| Mediana rechazados | ${data.medianRejected} |\n` +
  `| Muestra por clase para IC99 ±0,05 en AUC | ${requiredPerClass} |\n\n` +
  `| Banda | Pos | Neg | LR | IC99 LR | Prior | Posterior |\n|---|---:|---:|---:|---|---:|---:|\n` +
  bands.map((b) => `| ${b.id} | ${b.pos} | ${b.neg} | ${b.lr} | ${b.lrLow}–${b.lrHigh} | ${b.prior} | ${b.posterior} |`).join('\n') +
  `\n\n${data.note}\n`;
await writeFile('data/calibration.md', md, 'utf8');

console.log(JSON.stringify(data, null, 2));
