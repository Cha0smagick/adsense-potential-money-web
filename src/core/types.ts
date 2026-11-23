// Tipos compartidos entre navegador y Node. Solo tipos: deben importarse con `import type`
// para que Node pueda ejecutar el codigo sin paso de build (type stripping).

export type Status = 'pass' | 'warn' | 'fail' | 'unknown';

export type Category = 'content' | 'policy' | 'essential' | 'ux' | 'crawl' | 'performance';

export interface CategoryMeta {
  id: Category;
  label: string;
  weight: number;
  why: string;
}

export interface SignalResult {
  id: string;
  label: string;
  category: Category;
  weight: number;
  status: Status;
  value: string | null;
  evidence: string;
  advice: string;
  /** Puntos de score que se ganarian si esta senal pasara a `pass`. */
  impact: number;
}

export interface GateResult {
  id: string;
  label: string;
  cap: number;
  why: string;
  triggered: boolean;
}

export interface CategoryScore {
  id: Category;
  label: string;
  weight: number;
  score: number | null;
  resolved: number;
  signals: SignalResult[];
}

export interface Verdict {
  band: 'ready' | 'caveats' | 'fix-first' | 'not-ready';
  label: string;
  summary: string;
  capApplied: number | null;
}

export interface ScoreResult {
  score: number;
  confidence: number;
  verdict: Verdict;
  categories: CategoryScore[];
  gates: GateResult[];
  signals: SignalResult[];
  unknowns: string[];
}

export interface NormalizedUrl {
  input: string;
  url: string;
  href: string;
  host: string;
  tld: string;
  path: string;
  https: boolean;
  registrable: string;
  platform: Platform;
}

export type Platform =
  | 'blogspot' | 'wordpress.com' | 'wix' | 'shopify' | 'ghost' | 'webflow'
  | 'squarespace' | 'joomla' | 'drupal' | 'prestashop' | 'magento' | 'unknown';

export interface LinkRef {
  href: string;
  text: string;
  rel: string;
  target: string;
  internal: boolean;
}

export interface PageDoc {
  url: string;
  title: string;
  metaDescription: string;
  lang: string;
  canonical: string;
  robotsMeta: string[];
  h1: string[];
  h2: string[];
  h3: string[];
  paragraphs: string[];
  text: string;
  wordCount: number;
  htmlLength: number;
  textRatio: number;
  links: LinkRef[];
  internalLinks: LinkRef[];
  images: { src: string; alt: string }[];
  scriptCount: number;
  inlineScriptBytes: number;
  jsonLdTypes: string[];
  og: Record<string, string>;
  viewport: string;
  favicon: string;
  formCount: number;
  hasAuthLink: boolean;
  adsCode: boolean;
  pubIds: string[];
  overlaySignals: number;
  emails: string[];
}

export interface LegalProbe {
  key: 'privacy' | 'terms' | 'about' | 'contact';
  found: boolean;
  url: string | null;
  status: number | null;
  note: string;
  /** false si la búsqueda quedó incompleta por error de red: entonces "no encontrada" no prueba nada. */
  verifiable: boolean;
}

export interface PsiMetrics {
  strategy: 'mobile' | 'desktop';
  performance: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  seo: number | null;
  bestPractices: number | null;
}

export interface FetchLogEntry {
  url: string;
  kind: 'html' | 'text';
  provider: string;
  ok: boolean;
  status: number;
  ms: number;
  bytes: number;
  note?: string;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  body: string;
  provider: string;
  ms: number;
  bytes: number;
  note?: string;
}

export type Fetcher = (url: string, kind: 'html' | 'text') => Promise<FetchResult>;

export interface AuditContext {
  input: string;
  normalized: NormalizedUrl;
  home: PageDoc | null;
  robots: { found: boolean; text: string; status: number | null } | null;
  adsTxt: { found: boolean; text: string; status: number | null } | null;
  sitemap: { found: boolean; url: string | null; urls: number; status: number | null } | null;
  legal: LegalProbe[];
  psi: PsiMetrics[];
  extraPages: { url: string; words: number; shingles: Set<string> }[];
  brokenLinks: { url: string; status: number }[];
  adsTxtRecord: { valid: boolean; pubId: string | null; note: string } | null;
  log: FetchLogEntry[];
  notes: string[];
}

export interface NicheKey {
  id: string;
  label: string;
  rpm: [number, number, number];
  ctr: number;
}

export interface ProjectionInput {
  sessions: number;
  pagesPerVisit: number;
  niche: NicheKey;
  country: string;
  mobileShare: number;
  ownRpm: number | null;
  ownCtr: number | null;
  perfNorm: number | null;
  contentPages: number | null;
}

export interface ScenarioPoint {
  month: number;
  sessions: number;
  revenue: number;
}

export interface ProjectionResult {
  rpm: { low: number; base: number; high: number };
  ctr: number;
  pageviewsMonth: number;
  impressionsMonth: number;
  clicksMonth: number;
  impliedCpc: number;
  scenarios: { id: 'pessimistic' | 'base' | 'optimistic'; label: string; points: ScenarioPoint[] }[];
  horizons: { months: number; base: number; pessimistic: number; optimistic: number; cumulative: number }[];
  inverse: { revenueTarget: number; sessionsNeeded: number; pagesNeeded: number };
  assumptions: string[];
}

export interface AuditReport {
  schema: 'report.v1';
  createdAt: string;
  engine: 'fast' | 'deep';
  target: NormalizedUrl;
  title: string;
  score: ScoreResult;
  blocked: boolean;
  facts: Record<string, string | number | boolean | null>;
  monetization: ProjectionResult;
  meta: {
    requests: number;
    durationMs: number;
    providers: string[];
    notes: string[];
    losUnknowns: string[];
  };
}
