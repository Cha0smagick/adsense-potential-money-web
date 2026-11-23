import type { AuditContext, AuditReport, Fetcher, FetchLogEntry, LegalProbe, NicheKey, PsiMetrics } from './types.ts';
import { detectPlatformFromHtml, normalizeUrl } from './normalize.ts';
import { parseHtml } from './html.ts';
import { parseRobots } from './robots.ts';
import { LEGAL_HINTS, LEGAL_PROBES, NICHES } from './lexicon.ts';
import { buildSignals, detectNicheId, shingles } from './signals.ts';
import { scoreSignals } from './score.ts';
import { project } from './projection.ts';

export interface AuditOptions {
  sessions: number;
  nicheId: string;
  country: string;
  mobileShare: number;
  ownRpm: number | null;
  ownCtr: number | null;
  engine: 'fast' | 'deep';
  maxExtraPages: number;
  psi: PsiMetrics[];
  /** El motor rapido lanza PSI en paralelo: se espera aqui, al final. */
  psiPromise?: Promise<PsiMetrics[]>;
}

export const DEFAULT_OPTIONS: AuditOptions = {
  sessions: 5000,
  nicheId: 'auto',
  country: 'US',
  mobileShare: 0.6,
  ownRpm: null,
  ownCtr: null,
  engine: 'fast',
  maxExtraPages: 0,
  psi: [],
};

const GOOGLE_ADS_TXT_AUTHORITY = 'f08c47fec0942fa0';

function legalProbeFromLinks(
  links: { href: string; text: string }[],
  key: LegalProbe['key'],
): string | null {
  const hints = LEGAL_HINTS[key];
  for (const link of links) {
    const hay = `${link.text} ${link.href}`.toLowerCase();
    if (hints.some((h) => hay.includes(h))) return link.href;
  }
  return null;
}

function parseAdsTxt(text: string): { valid: boolean; pubId: string | null; note: string } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const google = lines.filter((l) => l.toLowerCase().startsWith('google.com'));
  if (!google.length) return { valid: false, pubId: null, note: 'No hay ninguna línea de google.com en ads.txt.' };
  const record = google[0].split(',').map((x) => x.trim());
  const pubId = record[1] ?? null;
  const validPub = !!pubId && /^pub-\d{10,}$/i.test(pubId);
  const authoritative = record[3]?.toLowerCase() === GOOGLE_ADS_TXT_AUTHORITY;
  return {
    valid: validPub && authoritative,
    pubId,
    note: validPub
      ? authoritative
        ? 'Registro de Google válido con identificador de autoridad de certificación.'
        : 'Identificador pub correcto pero falta el identificador de autoridad de Google (f08c47fec0942fa0).'
      : 'El identificador pub no tiene el formato esperado (pub- seguido de dígitos).',
  };
}

function collectSitemapUrls(xml: string): { urls: number; isIndex: boolean } {
  const locs = xml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) ?? [];
  return { urls: locs.length, isIndex: /<sitemapindex/i.test(xml) };
}

export async function runAudit(fetcher: Fetcher, input: string, partial: Partial<AuditOptions> = {}): Promise<AuditReport> {
  const opts: AuditOptions = { ...DEFAULT_OPTIONS, ...partial };
  const started = Date.now();
  const normalized = normalizeUrl(input);
  const log: FetchLogEntry[] = [];
  const notes: string[] = [];

  const call = async (url: string, kind: 'html' | 'text') => {
    const res = await fetcher(url, kind);
    log.push({ url, kind, provider: res.provider, ok: res.ok, status: res.status, ms: res.ms, bytes: res.bytes, note: res.note });
    return res;
  };

  const base = `${normalized.https ? 'https' : 'http'}://${normalized.host}`;
  const origin = new URL(normalized.url).origin;

  // 1. Portada
  const homeRes = await call(normalized.url, 'html');
  let home = null;
  if (homeRes.ok && homeRes.body.length > 100) {
    home = parseHtml(homeRes.body, normalized.url);
    const platform = detectPlatformFromHtml(homeRes.body, normalized.platform);
    if (platform !== 'unknown') normalized.platform = platform;
  } else {
    notes.push(`No se pudo leer la portada (${homeRes.status}${homeRes.note ? `: ${homeRes.note}` : ''}).`);
  }

  // 2. robots.txt
  const robotsRes = await call(`${origin}/robots.txt`, 'text');
  const robots = robotsRes.status > 0
    ? { found: robotsRes.ok && robotsRes.status === 200 && robotsRes.body.length > 0, text: robotsRes.body, status: robotsRes.status }
    : null;
  const robotsParsed = robots?.found ? parseRobots(robots.text) : null;

  // 3. ads.txt (no puntua para aprobacion, si para monetizacion)
  const adsRes = await call(`${origin}/ads.txt`, 'text');
  const adsTxt = adsRes.status === 200 ? { found: true, text: adsRes.body, status: 200 } : { found: false, text: '', status: adsRes.status || null };
  const adsTxtRecord = adsTxt.found ? parseAdsTxt(adsTxt.text) : null;

  // 4. sitemap
  const sitemapCandidates = [...(robotsParsed?.sitemaps ?? [])];
  if (!sitemapCandidates.length) sitemapCandidates.push(`${origin}/sitemap.xml`);
  let sitemap: AuditContext['sitemap'] = { found: false, url: sitemapCandidates[0], urls: 0, status: null };
  for (const candidate of sitemapCandidates.slice(0, 2)) {
    const res = await call(candidate, 'text');
    if (res.status === 200 && /<(urlset|sitemapindex)/i.test(res.body)) {
      const parsed = collectSitemapUrls(res.body);
      sitemap = { found: true, url: candidate, urls: parsed.urls, status: 200 };
      if (parsed.isIndex) notes.push('El sitemap es un índice de sitemaps: cuenta el número de sitemaps, no de páginas.');
      break;
    }
    sitemap = { found: false, url: candidate, urls: 0, status: res.status || null };
  }

  // 5. Paginas legales: primero enlaces del menu, despues rutas conocidas.
  const legal: LegalProbe[] = [];
  const keys: LegalProbe['key'][] = ['privacy', 'terms', 'about', 'contact'];
  let probesLeft = 6;
  for (const key of keys) {
    const fromLinks = home ? legalProbeFromLinks(home.links, key) : null;
    let found = false;
    let url: string | null = null;
    let status: number | null = null;
    let note = '';
    let verifiable = true;

    const trackFailure = (res: { status: number }) => {
      if (res.status === 0 || res.status === 429 || res.status >= 500) verifiable = false;
    };

    if (fromLinks) {
      const res = await call(fromLinks, 'html');
      probesLeft--;
      trackFailure(res);
      if (res.status === 200) {
        found = true;
        url = fromLinks;
        status = res.status;
      } else {
        note = `El enlace del menú devolvió HTTP ${res.status || 'sin respuesta'}.`;
      }
    }

    if (!found && probesLeft > 0) {
      for (const probe of LEGAL_PROBES[key].slice(0, 2)) {
        if (probesLeft <= 0) break;
        const res = await call(`${origin}${probe}`, 'html');
        probesLeft--;
        trackFailure(res);
        if (res.status === 200 && res.body.length > 500) {
          found = true;
          url = `${origin}${probe}`;
          status = 200;
          break;
        }
        status = res.status || null;
      }
    }

    if (!found && probesLeft <= 0) verifiable = false;
    legal.push({ key, found, url, status, note, verifiable: found || verifiable });
  }

  // 6. Paginas extra (solo motor profundo)
  const extraPages: AuditContext['extraPages'] = [];
  const brokenLinks: AuditContext['brokenLinks'] = [];
  if (opts.engine === 'deep' && home && opts.maxExtraPages > 0) {
    const seen = new Set<string>();
    const candidates = home.internalLinks
      .map((l) => l.href.split('#')[0])
      .filter((u) => !seen.has(u) && seen.add(u) && u !== normalized.url)
      .slice(0, opts.maxExtraPages);
    for (const url of candidates) {
      const res = await call(url, 'html');
      if (!res.ok || res.body.length < 100) {
        if (res.status === 404 || res.status === 410) brokenLinks.push({ url, status: res.status });
        continue;
      }
      const doc = parseHtml(res.body, url);
      extraPages.push({ url, words: doc.wordCount, shingles: shingles(doc.text) });
    }
  }

  const context: AuditContext = {
    input,
    normalized,
    home,
    robots,
    adsTxt,
    sitemap,
    legal,
    psi: opts.psiPromise ? await opts.psiPromise : opts.psi,
    extraPages,
    brokenLinks,
    adsTxtRecord,
    log,
    notes,
  };

  const rawSignals = buildSignals(context);
  const score = scoreSignals(rawSignals);

  const nicheId = opts.nicheId === 'auto'
    ? detectNicheId(home?.title ?? '', home?.metaDescription ?? '', `${home?.text ?? ''}`)
    : opts.nicheId;
  const niche: NicheKey = NICHES.find((n) => n.id === nicheId) ?? NICHES[NICHES.length - 1];

  const perfNorm = (() => {
    const mobile = opts.psi.find((p) => p.strategy === 'mobile');
    return mobile?.performance != null ? mobile.performance / 100 : null;
  })();

  const monetization = project({
    sessions: opts.sessions,
    pagesPerVisit: 1.4,
    niche: { id: niche.id, label: niche.label, rpm: niche.rpm, ctr: niche.ctr },
    country: opts.country,
    mobileShare: opts.mobileShare,
    ownRpm: opts.ownRpm,
    ownCtr: opts.ownCtr,
    perfNorm,
    contentPages: sitemap.urls > 0 ? sitemap.urls : extraPages.length || null,
  });

  return {
    schema: 'report.v1',
    createdAt: new Date().toISOString(),
    engine: opts.engine,
    target: normalized,
    title: home?.title ?? '',
    score,
    blocked: score.gates.some((g) => g.triggered && (g.id === 'unreachable' || g.id === 'parked')),
    facts: {
      host: normalized.host,
      https: normalized.https,
      platform: normalized.platform,
      title: home?.title ?? null,
      lang: home?.lang || null,
      words: home?.wordCount ?? 0,
      paragraphs: home?.paragraphs.length ?? 0,
      internalLinks: home?.internalLinks.length ?? 0,
      images: home?.images.length ?? 0,
      imagesWithoutAlt: home?.images.filter((i) => !i.alt).length ?? 0,
      scripts: home?.scriptCount ?? 0,
      wordsPerPage: extraPages.length ? Math.round(extraPages.reduce((a, p) => a + p.words, 0) / extraPages.length) : null,
      sitemapUrls: sitemap.urls,
      niche: niche.label,
      adsTxt: adsTxtRecord ? adsTxtRecord.valid : false,
      adsCodeDetected: home?.adsCode ?? false,
      pubId: home?.pubIds[0] ?? null,
      requests: log.length,
    },
    monetization,
    meta: {
      requests: log.length,
      durationMs: Date.now() - started,
      providers: Array.from(new Set(log.map((l) => l.provider))),
      notes,
      losUnknowns: score.unknowns,
    },
  };
}
