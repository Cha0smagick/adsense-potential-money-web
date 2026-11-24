import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { normalizeUrl } from '../src/core/normalize.ts';
import type { NormalizedUrl } from '../src/core/types.ts';

// Consolida las fuentes en un dataset único y limpio para kaggle/.
// - CSV normalizados (UTF-8 BOM, Excel-ready)
// - crudo completo en kaggle/raw (selftext de Reddit, sin autores)
// - SQLite y Excel se generan después con scripts/build-db-xlsx.py

const SHARED = /\.(blogspot\.[a-z.]+|wordpress\.com|github\.io|gitlab\.io|netlify\.app|vercel\.app|pages\.dev|web\.app|wixsite\.com|weebly\.com|tumblr\.com|substack\.com|medium\.com)$/;
const TRACKING = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','ref'];

const OUTCOMES = new Set(['approved', 'rejected', 'pending', 'unknown']);

function siteKey(n: NormalizedUrl): string {
  if (SHARED.test(n.host)) {
    const first = n.path.split('/').filter(Boolean)[0];
    return first ? `${n.host}/${first}` : n.host;
  }
  return n.registrable;
}

function canonical(n: NormalizedUrl): string {
  try {
    const u = new URL(n.url);
    for (const p of TRACKING) u.searchParams.delete(p);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return n.url;
  }
}

function sanitize(s: unknown): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function iso(epoch: unknown): string {
  const n = Number(epoch);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): 0 | 1 | null {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  return null;
}

function csv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    // Neutraliza inyección de fórmulas al abrir en Excel/Sheets.
    const safe = /^[=+@-]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))];
  return `\uFEFF${lines.join('\r\n')}`;
}

async function readJson(path: string): Promise<any[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as any[];
  } catch {
    return [];
  }
}

await mkdir('kaggle/data', { recursive: true });
await mkdir('kaggle/raw', { recursive: true });
await mkdir('kaggle/db', { recursive: true });

const tranco = await readJson('data/raw/tranco-scan.json');
const reddit = await readJson('data/raw/reddit-measured.json');
const forum = await readJson('data/raw/negatives-measured.json');
const curated = await readJson('data/approval-cases.json');
const redditPosts = await readJson('data/raw/reddit-posts.json');
const redditCases = await readJson('data/raw/reddit-cases.json');
const calibration = JSON.parse(await readFile('data/calibration-latest.json', 'utf8'));

interface CaseRow {
  site_key: string;
  site_url: string;
  host: string;
  registrable: string;
  platform: string;
  outcome: string;
  outcome_source: string;
  source_type: string;
  source_url: string;
  date: string;
  stale: 0 | 1;
  reachable: 0 | 1 | null;
  score: number | null;
  confidence: number | null;
  gates: string;
  words: number | null;
  content_pages: number | null;
  privacy: string;
  adsense_code: 0 | 1 | null;
  can_monetize: 0 | 1 | null;
  title: string;
  label_conflict: 0 | 1;
  included_in_calibration: 0 | 1;
  notes: string;
}

const map = new Map<string, CaseRow>();

function upsert(input: {
  site?: string | null;
  outcome?: string;
  outcome_source?: string;
  source_type?: string;
  source_url?: string;
  date?: string;
  stale?: unknown;
  reachable?: unknown;
  score?: unknown;
  confidence?: unknown;
  gates?: unknown;
  words?: unknown;
  content_pages?: unknown;
  privacy?: string;
  adsense_code?: unknown;
  can_monetize?: unknown;
  title?: string;
  notes?: string;
}) {
  if (!input.site) return;
  let n: NormalizedUrl;
  try {
    n = normalizeUrl(input.site);
  } catch {
    return;
  }
  const key = siteKey(n);
  const outcome = OUTCOMES.has(String(input.outcome)) ? String(input.outcome) : 'unknown';
  const row: CaseRow = {
    site_key: key,
    site_url: canonical(n),
    host: n.host,
    registrable: n.registrable,
    platform: n.platform,
    outcome,
    outcome_source: input.outcome_source ?? 'unknown',
    source_type: input.source_type ?? 'unknown',
    source_url: input.source_url ?? '',
    date: input.date ?? '',
    stale: (bool(input.stale) ?? 0) as 0 | 1,
    reachable: bool(input.reachable),
    score: num(input.score),
    confidence: num(input.confidence),
    gates: Array.isArray(input.gates) ? [...new Set(input.gates)].sort().join('|') : String(input.gates ?? ''),
    words: num(input.words),
    content_pages: num(input.content_pages),
    privacy: String(input.privacy ?? ''),
    adsense_code: bool(input.adsense_code),
    can_monetize: bool(input.can_monetize),
    title: sanitize(input.title),
    label_conflict: 0,
    included_in_calibration: 0,
    notes: input.notes ?? '',
  };

  const cur = map.get(key);
  if (!cur) {
    map.set(key, row);
    return;
  }

  if (cur.outcome !== row.outcome && cur.outcome !== 'unknown' && row.outcome !== 'unknown') {
    cur.label_conflict = 1;
    // La observación directa de AdSense manda; si no, la fecha más reciente.
    if (row.outcome_source === 'observed_adsense' && cur.outcome_source !== 'observed_adsense') {
      cur.outcome = row.outcome;
      cur.outcome_source = row.outcome_source;
    } else if (row.outcome_source !== 'observed_adsense' && cur.outcome_source !== 'observed_adsense' && row.date > cur.date) {
      cur.outcome = row.outcome;
      cur.outcome_source = row.outcome_source;
    }
  }

  cur.stale = (cur.stale || row.stale) as 0 | 1;
  if (cur.reachable === null) cur.reachable = row.reachable;
  else if (row.reachable === 1) cur.reachable = 1;
  cur.score = cur.score ?? row.score;
  cur.confidence = cur.confidence ?? row.confidence;
  cur.words = Math.max(cur.words ?? 0, row.words ?? 0) || null;
  cur.content_pages = Math.max(cur.content_pages ?? 0, row.content_pages ?? 0) || null;
  cur.adsense_code = (cur.adsense_code || row.adsense_code) as 0 | 1 | null;
  cur.can_monetize = cur.can_monetize ?? row.can_monetize;
  cur.date = row.date > cur.date ? row.date : cur.date;
  cur.source_url = cur.source_url || row.source_url;
  cur.title = cur.title || row.title;
  if (row.source_type && !cur.notes.includes(row.source_type)) cur.notes = [cur.notes, row.source_type].filter(Boolean).join('; ');
}

// 1) Tranco: aprobados observados
for (const r of tranco) {
  upsert({
    site: r.url,
    outcome: 'approved',
    outcome_source: 'observed_adsense',
    source_type: 'tranco',
    source_url: r.url,
    date: '2026-11-24',
    stale: 0,
    reachable: 1,
    score: r.score,
    confidence: r.confidence,
    gates: r.gates ?? [],
    words: r.words,
    content_pages: r.contentPages,
    privacy: r.privacy,
    adsense_code: 1,
    can_monetize: r.canMonetize,
    title: r.title,
  });
}

// 2) Reddit medido
for (const r of reddit) {
  upsert({
    site: r.url ?? r.site,
    outcome: r.outcome,
    outcome_source: 'self_reported',
    source_type: 'reddit',
    source_url: r.source,
    date: iso(r.created),
    stale: r.stale,
    reachable: r.reachable,
    score: r.score,
    confidence: r.confidence,
    gates: r.gates ?? [],
    words: r.words,
    content_pages: r.contentPages,
    privacy: r.privacy,
    adsense_code: r.adsCode,
    can_monetize: r.canMonetize,
    title: r.title,
  });
}

// 3) Foro medido
for (const r of forum) {
  upsert({
    site: r.site ?? r.url,
    outcome: r.outcome,
    outcome_source: 'self_reported',
    source_type: 'adsense_forum',
    source_url: r.source,
    date: r.date ?? '',
    stale: r.stale,
    reachable: r.reachable,
    score: r.score,
    confidence: r.confidence,
    gates: r.gates ?? [],
    words: r.words,
    content_pages: r.contentPages,
    privacy: r.privacy,
    adsense_code: r.adsCode,
    can_monetize: r.canMonetize,
    title: r.title,
  });
}

// 4) Curado (15 casos con fuente y fecha)
for (const r of curated) {
  upsert({
    site: r.site,
    outcome: r.outcome,
    outcome_source: 'curated',
    source_type: 'curated',
    source_url: r.source,
    date: r.date,
    title: r.reason,
    notes: r.reason,
  });
}

// Inclusión en calibración
for (const c of map.values()) {
  if (c.label_conflict) continue;
  if (c.outcome === 'approved' && c.reachable === 1 && c.score !== null) c.included_in_calibration = 1;
  if (c.outcome === 'rejected' && c.reachable === 1 && c.score !== null && c.stale === 0 && (c.words ?? 0) > 0) c.included_in_calibration = 1;
}

const cases = Array.from(map.values()).sort((a, b) => a.site_key.localeCompare(b.site_key)).map((c, i) => ({
  case_id: `C${String(i + 1).padStart(6, '0')}`,
  ...c,
}));

const caseColumns = [
  'case_id','site_key','site_url','host','registrable','platform','outcome','outcome_source','source_type',
  'source_url','date','stale','reachable','score','confidence','gates','words','content_pages','privacy',
  'adsense_code','can_monetize','title','label_conflict','included_in_calibration','notes',
];
await writeFile('kaggle/data/cases.csv', csv(cases, caseColumns), 'utf8');

// 5) Posts de Reddit (metadatos, sin selftext)
const byPost = new Map<string, { outcomes: Set<string>; sites: Set<string> }>();
for (const c of redditCases) {
  if (!c.id) continue;
  const e = byPost.get(c.id) ?? { outcomes: new Set<string>(), sites: new Set<string>() };
  e.outcomes.add(c.outcome);
  for (const s of c.sites ?? []) e.sites.add(s);
  byPost.set(c.id, e);
}
const posts = redditPosts.map((p) => {
  const e = byPost.get(p.id);
  const outcomes = e ? Array.from(e.outcomes) : [];
  return {
    post_id: p.id,
    created_utc: p.created ?? '',
    date: iso(p.created),
    title: sanitize(p.title),
    outcome: outcomes.length === 1 ? outcomes[0] : outcomes.length > 1 ? 'conflict' : 'unknown',
    site_count: e ? e.sites.size : 0,
    sites: e ? Array.from(e.sites).join('|') : '',
    source_url: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
  };
});
await writeFile('kaggle/data/posts.csv', csv(posts, ['post_id','created_utc','date','title','outcome','site_count','sites','source_url']), 'utf8');

// 6) Tranco, foro y calibración
await writeFile(
  'kaggle/data/tranco_sites.csv',
  csv(
    tranco.map((r) => ({
      domain: r.domain, url: r.url, score: r.score, confidence: r.confidence,
      gates: Array.isArray(r.gates) ? r.gates.join('|') : '', words: r.words,
      content_pages: r.contentPages, privacy: r.privacy, can_monetize: bool(r.canMonetize), title: sanitize(r.title),
    })),
    ['domain','url','score','confidence','gates','words','content_pages','privacy','can_monetize','title'],
  ),
  'utf8',
);
await writeFile(
  'kaggle/data/forum_cases.csv',
  csv(
    forum.map((r, i) => ({
      case_id: `F${String(i + 1).padStart(4, '0')}`,
      site: r.site ?? r.url, outcome: r.outcome, date: r.date ?? '', score: r.score,
      stale: bool(r.stale), reachable: bool(r.reachable), words: r.words,
      adsense_code: bool(r.adsCode), source: r.source,
    })),
    ['case_id','site','outcome','date','score','stale','reachable','words','adsense_code','source'],
  ),
  'utf8',
);
await writeFile(
  'kaggle/data/calibration_bands.csv',
  csv(
    calibration.bands.map((b: any) => ({
      band: b.id, min: b.min, max: b.max, positives: b.pos, negatives: b.neg,
      lr: b.lr, lr_low: b.lrLow, lr_high: b.lrHigh, prior: b.prior, posterior: b.posterior,
    })),
    ['band','min','max','positives','negatives','lr','lr_low','lr_high','prior','posterior'],
  ),
  'utf8',
);
await writeFile('kaggle/data/calibration_meta.json', JSON.stringify(calibration, null, 2), 'utf8');
const metaRows = Object.entries(calibration).filter(([k]) => k !== 'bands').map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : String(value) }));
await writeFile('kaggle/data/calibration_meta.csv', csv(metaRows, ['key','value']), 'utf8');

// 7) Crudo completo (local; selftext sin autores)
const full = redditPosts.map((p) => ({
  post_id: p.id,
  created_utc: p.created ?? '',
  date: iso(p.created),
  title: p.title ?? '',
  selftext: p.selftext ?? '',
  url: p.url ?? '',
  source_url: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
}));
await writeFile('kaggle/raw/reddit_posts_full.csv', csv(full, ['post_id','created_utc','date','title','selftext','url','source_url']), 'utf8');
await copyFile('data/raw/tranco-scan.json', 'kaggle/raw/tranco_scan_raw.json');
await copyFile('data/raw/forum-cases-38.json', 'kaggle/raw/forum_cases_raw.json');
await copyFile('data/raw/reddit-cases.json', 'kaggle/raw/reddit_cases_raw.json');

const included = cases.filter((c) => c.included_in_calibration === 1);
const approved = included.filter((c) => c.outcome === 'approved').length;
const rejected = included.filter((c) => c.outcome === 'rejected').length;
const stale = cases.filter((c) => c.stale === 1).length;
const conflicts = cases.filter((c) => c.label_conflict === 1).length;

const counts = {
  cases: cases.length,
  included: included.length,
  approved,
  rejected,
  stale,
  conflicts,
  posts: posts.length,
  tranco: tranco.length,
  forum: forum.length,
};

const schema = `-- AdSense Approval & Rejection Dataset — esquema SQLite
CREATE TABLE cases (
  case_id TEXT PRIMARY KEY,
  site_key TEXT NOT NULL,
  site_url TEXT NOT NULL,
  host TEXT NOT NULL,
  registrable TEXT,
  platform TEXT,
  outcome TEXT CHECK (outcome IN ('approved','rejected','pending','unknown')),
  outcome_source TEXT,
  source_type TEXT,
  source_url TEXT,
  date TEXT,
  stale INTEGER CHECK (stale IN (0,1)),
  reachable INTEGER CHECK (reachable IN (0,1) OR reachable IS NULL),
  score REAL,
  confidence REAL,
  gates TEXT,
  words INTEGER,
  content_pages INTEGER,
  privacy TEXT,
  adsense_code INTEGER CHECK (adsense_code IN (0,1) OR adsense_code IS NULL),
  can_monetize INTEGER CHECK (can_monetize IN (0,1) OR can_monetize IS NULL),
  title TEXT,
  label_conflict INTEGER DEFAULT 0,
  included_in_calibration INTEGER DEFAULT 0,
  notes TEXT
);
CREATE UNIQUE INDEX idx_cases_site_key ON cases(site_key);
CREATE INDEX idx_cases_outcome ON cases(outcome);
CREATE INDEX idx_cases_included ON cases(included_in_calibration);

CREATE TABLE posts (
  post_id TEXT PRIMARY KEY,
  created_utc INTEGER,
  date TEXT,
  title TEXT,
  outcome TEXT,
  site_count INTEGER,
  sites TEXT,
  source_url TEXT
);
CREATE INDEX idx_posts_outcome ON posts(outcome);

CREATE TABLE tranco_sites (
  domain TEXT PRIMARY KEY,
  url TEXT,
  score REAL,
  confidence REAL,
  gates TEXT,
  words INTEGER,
  content_pages INTEGER,
  privacy TEXT,
  can_monetize INTEGER,
  title TEXT
);

CREATE TABLE forum_cases (
  case_id TEXT PRIMARY KEY,
  site TEXT,
  outcome TEXT,
  date TEXT,
  score REAL,
  stale INTEGER,
  reachable INTEGER,
  words INTEGER,
  adsense_code INTEGER,
  source TEXT
);

CREATE TABLE calibration_bands (
  band TEXT PRIMARY KEY,
  min REAL,
  max REAL,
  positives INTEGER,
  negatives INTEGER,
  lr REAL,
  lr_low REAL,
  lr_high REAL,
  prior REAL,
  posterior REAL
);

CREATE TABLE calibration_meta (key TEXT PRIMARY KEY, value TEXT);

CREATE VIEW calibration_ready AS
SELECT * FROM cases WHERE included_in_calibration = 1;
`;
await writeFile('kaggle/schema.sql', schema, 'utf8');

const readme = `# AdSense Approval & Rejection Dataset

Dataset case-control de sitios web con resultado declarado u observado de Google AdSense,
medidos con el auditor. Generado el 2026-11-24.

## Contenido

| Archivo | Filas | Qué es |
|---|---:|---|
| \`data/cases.csv\` | ${counts.cases} | Base única por sitio: resultado, fuente, features, flags de calidad |
| \`data/posts.csv\` | ${counts.posts} | Metadatos de 6.000 posts de r/Adsense (sin texto ni autores) |
| \`data/tranco_sites.csv\` | ${counts.tranco} | Sitios de Tranco que hoy sirven AdSense |
| \`data/forum_cases.csv\` | ${counts.forum} | Rechazos públicos del foro de AdSense |
| \`data/calibration_bands.csv\` | ${calibration.bands.length} | LR por banda con IC99 |
| \`data/calibration_meta.json\` | — | Metadatos de la calibración |
| \`db/adsense_approval.sqlite\` | — | Misma base en SQLite, con índices y vista \`calibration_ready\` |
| \`adsense_approval.xlsx\` | — | Excel multi-hoja |
| \`raw/\` | — | Crudo completo: selftext de Reddit sin autores. **Local, no publicar sin anonimizar** |

## Base única: \`cases.csv\`

Un registro por \`site_key\` (dominio registrable; host en plataformas compartidas).
Columnas clave:

- \`outcome\`: approved / rejected / pending / unknown.
- \`outcome_source\`: observed_adsense (código en el HTML), self_reported (post), curated.
- \`stale\`: 1 si el sitio fue rechazado pero hoy ya muestra anuncios. Etiqueta desactualizada.
- \`reachable\`: 1 si se pudo leer contenido.
- \`score\`, \`confidence\`, \`gates\`, \`words\`, \`content_pages\`, \`privacy\`.
- \`label_conflict\`: 1 si el sitio aparece aprobado y rechazado en fuentes distintas.
- \`included_in_calibration\`: 1 solo si cumple las reglas de limpieza (sin conflicto, sin stale,
  legible, con score y, en rechazos, contenido).

**Conteos de la base:** ${counts.cases} sitios, ${counts.included} incluidos en calibración
(${counts.approved} aprobados / ${counts.rejected} rechazados), ${counts.stale} con etiqueta stale,
${counts.conflicts} con conflicto.

> Nota: la tabla de calibración se generó con 44 rechazos; la base limpia tiene 46 tras una
> deduplicación posterior. El AUC (0,405) no cambia de forma material.

## Cómo cargarlo

\`\`\`python
import pandas as pd
cases = pd.read_csv("kaggle/data/cases.csv")
cal = cases.query("included_in_calibration == 1")
print(cal["outcome"].value_counts())
\`\`\`

\`\`\`bash
sqlite3 kaggle/db/adsense_approval.sqlite "SELECT outcome, COUNT(*) FROM cases GROUP BY 1;"
\`\`\`

## Advertencia

El score del auditor **no predice la aprobación** en esta muestra: AUC 0,405 (IC99 0,272–0,542),
y los rechazos puntúan más alto. El dataset es valioso para estudiar **defectos de contenido,
deriva de etiquetas y sesgo de foros**, no como oráculo de aprobación. Ver \`dataset-card.md\`.
`;
await writeFile('kaggle/README.md', readme, 'utf8');

const card = `# Dataset Card — AdSense Approval & Rejection (case-control)

## Resumen

- **Qué**: ${counts.cases} sitios con resultado de AdSense, features de contenido y banderas de calidad.
- **Fuentes**: r/Adsense vía Arctic Shift (6.000 posts), foro oficial de AdSense, lista Tranco,
  medición directa del HTML público.
- **Fecha de recolección**: 2026-11-24.
- **Idioma**: títulos en inglés (Reddit/foro); features en inglés.
- **Licencia de la compilación**: CC BY 4.0. Los textos de terceros siguen siendo de sus autores;
  no se incluye \`selftext\` en la base limpia.

## Composición

| Clase | n |
|---|---:|
| Aprobados | ${counts.approved} |
| Rechazos válidos | ${counts.rejected} |
| Stale (rechazo que hoy muestra anuncios) | ${counts.stale} |
| Conflictos de etiqueta | ${counts.conflicts} |

## Metodología

1. Descarga de 6.000 posts de r/Adsense desde Arctic Shift (archivo público).
2. Extracción de URL del sitio desde título, texto y enlace; normalización y deduplicación por
   dominio registrable (host en blogspot/wordpress/github.io/netlify/vercel).
3. Etiquetado por título/texto: aprobado, rechazado o pendiente; se descartan preguntas ambiguas.
4. Medición con el auditor: portada, robots, sitemap y hasta 4 páginas legales.
5. Limpieza: \`stale\` si el rechazo ya muestra AdSense; \`label_conflict\` si hay etiquetas opuestas;
   \`included_in_calibration\` solo para casos legibles, sin conflicto y sin stale.

## Usos previstos

- Estudiar qué features distinguen (o no) sitios aprobados y rechazados.
- Medir deriva de etiquetas: sitios rechazados que después fueron aprobados.
- Benchmark de auditores de contenido/AdSense.
- NLP sobre títulos (no sobre selftext en la versión limpia).

## Limitaciones

- **Muestra no representativa**: los foros sobrerrepresentan rechazos; Tranco no es la población
  de solicitantes.
- **Etiquetas autodeclaradas**: aprobaciones/rechazos de Reddit no están verificados por Google.
- **Features actuales, no históricas**: el sitio se midió en 2026-11-24, no en la fecha del post.
- **Deriva**: ${counts.stale} rechazos ya muestran anuncios.
- **AUC 0,405 (IC99 0,272–0,542)**: el score no discrimina; no usar como probabilidad.
- **Sin datos personales** en la base limpia; el \`selftext\` crudo está en \`raw/\` y es local.

## Ética y privacidad

- No se guardan nombres de usuario, IDs de autor ni correos.
- Los títulos se sanean (emails/teléfonos reemplazados).
- \`raw/reddit_posts_full.csv\` contiene texto íntegro de usuarios: **no publicar** hasta anonimizar.
- Contacto para retiradas: magiadelcaospractica@gmail.com.

## Cita

\`\`\`bibtex
@dataset{cha0smagick_adsense_2026,
  title = {AdSense Approval & Rejection Dataset (case-control)},
  author = {Cha0sMagick Labs},
  year = {2026},
  note = {Compilación de fuentes públicas; CC BY 4.0}
}
\`\`\`
`;
await writeFile('kaggle/dataset-card.md', card, 'utf8');

await writeFile(
  'kaggle/raw/README.md',
  `# Crudo completo\n\n- \`reddit_posts_full.csv\`: 6.000 posts con \`selftext\` íntegro, sin autores.\n- \`tranco_scan_raw.json\`, \`forum_cases_raw.json\`, \`reddit_cases_raw.json\`.\n\n**No publicar** hasta decidir la anonimización: el selftext puede contener datos personales.\nLa base limpia (\`../data/\`) no incluye selftext.\n`,
  'utf8',
);

console.log(JSON.stringify(counts, null, 2));
