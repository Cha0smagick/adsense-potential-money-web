import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Manifiesto + validación del paquete kaggle/.

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '');
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); lines.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); lines.push(row); }
  const header = lines.shift() ?? [];
  return { header, rows: lines.filter((r) => r.length > 1 || (r[0] ?? '') !== '') };
}

const cases = parseCsv(await readFile('kaggle/data/cases.csv', 'utf8'));
const posts = parseCsv(await readFile('kaggle/data/posts.csv', 'utf8'));
const bands = parseCsv(await readFile('kaggle/data/calibration_bands.csv', 'utf8'));
const meta = JSON.parse(await readFile('kaggle/data/calibration_meta.json', 'utf8'));

const idx = (header: string[], name: string) => header.indexOf(name);
const cOutcome = idx(cases.header, 'outcome');
const cScore = idx(cases.header, 'score');
const cStale = idx(cases.header, 'stale');
const cAds = idx(cases.header, 'adsense_code');
const cIncluded = idx(cases.header, 'included_in_calibration');
const cSiteKey = idx(cases.header, 'site_key');
const cCaseId = idx(cases.header, 'case_id');

const siteKeys = new Set(cases.rows.map((r) => r[cSiteKey]));
const caseIds = new Set(cases.rows.map((r) => r[cCaseId]));
const outcomes = cases.rows.reduce((acc, r) => ({ ...acc, [r[cOutcome]]: (acc[r[cOutcome]] ?? 0) + 1 }), {} as Record<string, number>);
const included = cases.rows.filter((r) => r[cIncluded] === '1');
const staleBad = cases.rows.filter((r) => r[cStale] === '1' && r[cAds] !== '1');
const badScore = cases.rows.filter((r) => r[cScore] && (Number(r[cScore]) < 0 || Number(r[cScore]) > 100));
const emailTitles = cases.rows.filter((r) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(r[idx(cases.header, 'title')] ?? ''));
const forbiddenCols = cases.header.filter((h) => /author|username|user_id|email/i.test(h));

const files = walk('kaggle').map((p) => {
  const buf = readFileSync(p) as Buffer;
  return { path: p.replace(/\\/g, '/'), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
});

const manifest = {
  generated_at: new Date().toISOString(),
  dataset: 'AdSense Approval & Rejection (case-control)',
  counts: {
    cases: cases.rows.length,
    unique_site_keys: siteKeys.size,
    outcomes,
    included_in_calibration: included.length,
    posts: posts.rows.length,
    calibration_bands: bands.rows.length,
    auc: meta.auc,
    auc_low: meta.aucLow,
    auc_high: meta.aucHigh,
  },
  files,
};
await writeFile('kaggle/manifest.json', JSON.stringify(manifest, null, 2), 'utf8');

const ok = [
  ['case_id único', caseIds.size === cases.rows.length],
  ['site_key único', siteKeys.size === cases.rows.length],
  ['outcomes válidos', Object.keys(outcomes).every((o) => ['approved', 'rejected', 'pending', 'unknown', 'conflict'].includes(o))],
  ['score 0-100', badScore.length === 0],
  ['stale implica adsense_code=1', staleBad.length === 0],
  ['sin columnas de autor', forbiddenCols.length === 0],
  ['sin emails en títulos', emailTitles.length === 0],
  ['posts único', new Set(posts.rows.map((r) => r[0])).size === posts.rows.length],
  ['4 bandas', bands.rows.length === 4],
  ['SQLite existe', files.some((f) => f.path.endsWith('adsense_approval.sqlite'))],
  ['XLSX existe', files.some((f) => f.path.endsWith('adsense_approval.xlsx'))],
];

const report = `# Validación del paquete

Generado: ${manifest.generated_at}

| Comprobación | Resultado |
|---|---|
${ok.map(([name, pass]) => `| ${name} | ${pass ? 'OK' : 'FALLO'} |`).join('\n')}

## Conteos

- Casos: **${cases.rows.length}** (site_key únicos: ${siteKeys.size})
- Incluidos en calibración: **${included.length}**
- Distribución: ${Object.entries(outcomes).map(([k, v]) => `${k}=${v}`).join(', ')}
- Posts: **${posts.rows.length}**
- Bandas: ${bands.rows.length}
- AUC: ${meta.auc} (IC99 ${meta.aucLow}–${meta.aucHigh})
- Stale: ${cases.rows.filter((r) => r[cStale] === '1').length}
- Conflictos: ${cases.rows.filter((r) => r[idx(cases.header, 'label_conflict')] === '1').length}
- Títulos con email: ${emailTitles.length}
- Columnas prohibidas: ${forbiddenCols.length ? forbiddenCols.join(', ') : 'ninguna'}

## Archivos

${files.map((f) => `- \`${f.path}\` — ${(f.bytes / 1024).toFixed(1)} KB`).join('\n')}
`;
await writeFile('kaggle/validation-report.md', report, 'utf8');

console.log(ok.map(([name, pass]) => `${pass ? 'OK  ' : 'FALLO'} ${name}`).join('\n'));
console.log(JSON.stringify(manifest.counts, null, 2));
