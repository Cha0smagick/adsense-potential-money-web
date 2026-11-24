// Tipos compartidos entre navegador y Node. Solo tipos: deben importarse con `import type`
// para que Node pueda ejecutar el codigo sin paso de build (type stripping).

import type { Descriptive } from './stats.ts';

export type Status = 'pass' | 'warn' | 'fail' | 'unknown';

export type Category = 'content' | 'policy' | 'essential' | 'ux' | 'crawl' | 'performance';

export interface CategoryMeta {
  id: Category;
  label: string;
  weight: number;
  why: string;
}

export interface FixLink {
  url: string;
  label: string;
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
  /** Enlace oficial para corregir el hallazgo. Obligatorio en runtime, opcional en tests. */
  fix?: FixLink | null;
  /** Puntos de score que se ganarian si esta senal pasara a `pass`. */
  impact: number;
}

export interface GateResult {
  id: string;
  label: string;
  cap: number;
  why: string;
  triggered: boolean;
  fix?: FixLink | null;
}

export interface CategoryScore {
  id: Category;
  label: string;
  weight: number;
  score: number | null;
  resolved: number;
  signals: SignalResult[];
}

export type VerdictBand = 'ready' | 'caveats' | 'fix-first' | 'not-ready' | 'insufficient';

export interface Verdict {
  band: VerdictBand;
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

/**
 * Propiedad del dominio. `platform` = subdominio de una plataforma compartida
 * (blogspot, wordpress.com, github.io, netlify.app...): el dominio raiz no es del usuario.
 */
export type Ownership = 'owned' | 'platform';

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
  ownership: Ownership;
  /** Raiz del sitio auditado. En project pages (`user.github.io/repo/`) incluye la subruta. */
  siteRoot: string;
  /** Primera subruta cuando el sitio vive en una subcarpeta. */
  basePath: string;
  /** Etiqueta legible: `host` o `host/repo`. */
  subject: string;
  /** Identificador seguro para nombres de archivo. */
  slug: string;
}

export type Platform =
  | 'blogspot' | 'wordpress.com' | 'wix' | 'shopify' | 'ghost' | 'webflow'
  | 'squarespace' | 'joomla' | 'drupal' | 'prestashop' | 'magento'
  | 'github-pages' | 'gitlab-pages' | 'netlify' | 'vercel' | 'cloudflare-pages'
  | 'firebase' | 'weebly' | 'tumblr' | 'substack' | 'medium' | 'neocities'
  | 'unknown';

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
  xRobotsTag: string;
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
  /** URL final tras redirecciones. Necesaria para resolver relativos y sondas. */
  finalUrl?: string;
  /** Cabeceras de la respuesta final (solo el motor directo las conserva). */
  headers?: Record<string, string>;
}

export type Fetcher = (url: string, kind: 'html' | 'text') => Promise<FetchResult>;

export interface SitemapInfo {
  found: boolean;
  url: string | null;
  urls: number;
  /** Locaciones de pagina recogidas (muestra de la poblacion para estadistica). */
  pages: string[];
  isIndex: boolean;
  status: number | null;
  lastmods?: string[];
}

export interface AuditContext {
  input: string;
  normalized: NormalizedUrl;
  home: PageDoc | null;
  robots: { found: boolean; reachable: boolean; text: string; status: number | null } | null;
  adsTxt: { found: boolean; text: string; status: number | null } | null;
  sitemap: SitemapInfo | null;
  legal: LegalProbe[];
  psi: PsiMetrics[];
  extraPages: { url: string; words: number; shingles: Set<string>; latencyMs?: number; utility: boolean }[];
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

export interface EconomicsResult {
  /** Techo teorico con el RPM alto del nicho y la capacidad de contenido. */
  grossMonthly: number;
  /** Ingreso esperado con el RPM base y las sesiones actuales. */
  expectedMonthly: number;
  /** Ingreso actual: 0 si no hay RPM propio o el sitio no puede mostrar anuncios. */
  currentMonthly: number;
  /** expectedMonthly - currentMonthly, nunca negativo. */
  gapMonthly: number;
  /** gapMonthly / expectedMonthly, 0..1. */
  gapRatio: number;
  /** true si el ingreso actual se conoce (RPM propio) o si es 0 por bloqueo. */
  currentKnown: boolean;
  /** Cómo leer la brecha: medida, potencial no verificado o bloqueo total. */
  gapLabel: 'medida' | 'potencial' | 'bloqueado';
  capacitySessions: number;
  contentPages: number;
  avgWords: number | null;
  /** Supuestos y de donde sale cada numero. */
  drivers: string[];
}

export type LossMechanism = 'binary' | 'factor' | 'risk';

export interface LossItem {
  id: string;
  label: string;
  mechanism: LossMechanism;
  monthlyLoss: { low: number; base: number; high: number };
  /** 1 = solo ingresos, 5 = bloquea la aprobacion o puede suspender la cuenta. */
  severity: 1 | 2 | 3 | 4 | 5;
  /** 1 = 15 minutos, 5 = mas de una semana. */
  effort: 1 | 2 | 3 | 4 | 5;
  hours: number;
  fix: FixLink | null;
  basis: string;
}

export interface AttributionResult {
  items: LossItem[];
  totals: { certain: number; measured: number; expected: number; all: number };
  gateId: string | null;
  /** Si hay gate, las demas perdidas quedan subsumidas y no se suman. */
  subsumedByGate: boolean;
  narrative: string[];
}

export interface ApprovalResult {
  /** Indice de preparacion 0..100. No es el score: descuenta riesgo estructural. */
  readiness: number;
  probability: { low: number; base: number; high: number };
  days: { p50: number; p80: number; p90: number };
  drivers: { label: string; delta: number; note: string }[];
  applyNow: { expectedDays: number; expectedCost: number; rejectionP: number };
  prepareFirst: { expectedDays: number; expectedCost: number; fixDays: number };
  recommendation: 'apply-now' | 'prepare-first';
  calibrated: false;
  validation: import('./calibration.ts').PublicCalibration;
  notes: string[];
}

export interface PublicData {
  domain: string;
  /** false en subdominios de plataforma: RDAP y Tranco describen el dominio raíz ajeno. */
  eligible: boolean;
  rdap: { registered: string | null; expires: string | null; registrar: string | null; ageYears: number | null; status: string[] } | null;
  dns: {
    a: string[];
    ns: string[];
    mx: string[];
    txt: string[];
    spf: boolean;
    dmarc: boolean;
    verifications: string[];
    hosting: string;
  } | null;
  tranco: { rank: number | null; date: string | null; history: { date: string; rank: number }[] } | null;
  wayback: { first: string | null; last: string | null; closest: string | null } | null;
  sources: { name: string; url: string; ok: boolean; note: string }[];
  notes: string[];
}

export interface StatsTest {
  id: string;
  label: string;
  n: number;
  statistic: number;
  p: number | null;
  effect: number | null;
  effectLabel: string;
  decision: string;
  reliable: boolean;
}

export interface StatsResult {
  n: number;
  population: number;
  seed: number | null;
  variables: Record<string, Descriptive>;
  tests: StatsTest[];
  histogram: { variable: string; bins: { start: number; end: number; count: number }[] } | null;
  notes: string[];
}

export interface AuditReport {
  schema: 'report.v2';
  createdAt: string;
  engine: 'fast' | 'deep';
  target: NormalizedUrl;
  title: string;
  score: ScoreResult;
  blocked: boolean;
  facts: Record<string, string | number | boolean | null>;
  monetization: ProjectionResult;
  economics: EconomicsResult;
  attribution: AttributionResult;
  approval: ApprovalResult;
  publicData?: PublicData;
  stats?: StatsResult;
  meta: {
    requests: number;
    durationMs: number;
    providers: string[];
    notes: string[];
    unknowns: string[];
  };
}
