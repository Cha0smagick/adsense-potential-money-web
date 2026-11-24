import type { AuditContext, AuditReport, Fetcher, FetchLogEntry, LegalProbe, NicheKey, PsiMetrics, SitemapInfo } from './types.ts';
import { detectPlatformFromHtml, isUtilityUrl, normalizeUrl } from './normalize.ts';
import { parseHtml } from './html.ts';
import { parseRobots } from './robots.ts';
import { LEGAL_HINTS, LEGAL_PROBES, NICHES } from './lexicon.ts';
import { buildSignals, detectNicheId, shingles } from './signals.ts';
import { scoreSignals } from './score.ts';
import { project } from './projection.ts';
import { computeEconomics } from './economics.ts';
import { attributeLoss } from './attribution.ts';
import { canMonetizeWithAdsense, computeApproval } from './approval.ts';
import { normalizePool, sampleUrls, seedFrom } from './sample.ts';
import { analyze } from './analysis.ts';
import { collectPublicData } from '../fetch/public-data.ts';

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
  /** Semilla del muestreo. Si falta, se deriva del dominio (reproducible). */
  seed?: number;
  /** Consulta RDAP/DNS/Tranco/Wayback. Apagado por defecto: los tests no tocan la red. */
  publicData?: boolean;
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
  publicData: false,
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

function collectSitemap(xml: string): { urls: number; isIndex: boolean; pages: string[]; children: string[]; lastmods: string[] } {
  const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
  const lastmods = Array.from(xml.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)).map((m) => m[1]).slice(0, 2000);
  return {
    urls: locs.length,
    isIndex: /<sitemapindex/i.test(xml),
    pages: locs.filter((u) => !/\.xml($|\?)/i.test(u)).slice(0, 2000),
    children: locs.filter((u) => /\.xml($|\?)/i.test(u)).slice(0, 50),
    lastmods,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function runAudit(fetcher: Fetcher, input: string, partial: Partial<AuditOptions> = {}): Promise<AuditReport> {
  const opts: AuditOptions = { ...DEFAULT_OPTIONS, ...partial };
  const started = Date.now();
  let normalized = normalizeUrl(input);
  const log: FetchLogEntry[] = [];
  const notes: string[] = [];

  const call = async (url: string, kind: 'html' | 'text') => {
    const res = await fetcher(url, kind);
    log.push({ url, kind, provider: res.provider, ok: res.ok, status: res.status, ms: res.ms, bytes: res.bytes, note: res.note });
    return res;
  };

  // 1. Portada. Si HTTPS no responde, se intenta HTTP una sola vez (sitios antiguos).
  let homeRes = await call(normalized.url, 'html');
  if (!homeRes.ok && normalized.https && (homeRes.status === 0 || homeRes.status >= 500)) {
    const httpsNote = homeRes.note ?? 'sin detalle';
    const httpUrl = `http://${normalized.host}${normalized.path}`;
    const alt = await call(httpUrl, 'html');
    if (alt.ok) {
      homeRes = alt;
      notes.push(`HTTPS no respondió (${httpsNote}); se auditó la versión HTTP.`);
      normalized = normalizeUrl(httpUrl);
    }
  }

  // 2. URL final: si el sitio redirige a otro host o a otra ruta, se resuelve contra el destino.
  if (homeRes.finalUrl) {
    try {
      const final = normalizeUrl(homeRes.finalUrl);
      if (final.host !== normalized.host || final.path !== normalized.path) {
        notes.push(`La URL redirige a ${final.url}: se usa ese destino como base.`);
        normalized = final;
      }
    } catch {
      /* finalUrl no parseable: se mantiene la URL pedida */
    }
  }

  let home = null;
  if (homeRes.ok && homeRes.body.length > 100) {
    home = parseHtml(homeRes.body, normalized.url, homeRes.headers ?? {});
    const platform = detectPlatformFromHtml(homeRes.body, normalized.platform);
    if (platform !== 'unknown') normalized.platform = platform;
  } else {
    notes.push(`No se pudo leer la portada (${homeRes.status}${homeRes.note ? `: ${homeRes.note}` : ''}).`);
  }

  const protocol = normalized.https ? 'https' : 'http';
  const hostRoot = `${protocol}://${normalized.host}`;
  const siteRoot = normalized.siteRoot;

  // 3. robots.txt: siempre en la raíz del host (es donde los rastreadores lo buscan).
  const robotsRes = await call(`${hostRoot}/robots.txt`, 'text');
  const robotsReachable = robotsRes.status > 0 && robotsRes.status !== 429 && robotsRes.status < 500;
  const robots = robotsRes.status > 0
    ? {
        found: robotsReachable && robotsRes.status === 200 && robotsRes.body.length > 0,
        reachable: robotsReachable,
        text: robotsRes.body,
        status: robotsRes.status,
      }
    : null;
  const robotsParsed = robots?.found ? parseRobots(robots.text) : null;

  // 4. ads.txt: raíz del host y, en project pages, también la raíz del sitio.
  let adsRes = await call(`${hostRoot}/ads.txt`, 'text');
  if (adsRes.status !== 200 && siteRoot !== `${hostRoot}/`) {
    const alt = await call(`${siteRoot}ads.txt`, 'text');
    if (alt.status === 200) adsRes = alt;
  }
  const adsTxt = adsRes.status === 200
    ? { found: true, text: adsRes.body, status: 200 }
    : { found: false, text: '', status: adsRes.status || null };
  const adsTxtRecord = adsTxt.found ? parseAdsTxt(adsTxt.text) : null;

  // 5. sitemap: primero el declarado en robots.txt, después la raíz del sitio y la del host.
  const sitemapCandidates = [...(robotsParsed?.sitemaps ?? [])];
  sitemapCandidates.push(`${siteRoot}sitemap.xml`);
  if (siteRoot !== `${hostRoot}/`) sitemapCandidates.push(`${hostRoot}/sitemap.xml`);
  let sitemap: SitemapInfo = { found: false, url: sitemapCandidates[0], urls: 0, pages: [], isIndex: false, status: null };
  for (const candidate of Array.from(new Set(sitemapCandidates)).slice(0, 3)) {
    const res = await call(candidate, 'text');
    if (res.status === 200 && /<(urlset|sitemapindex)/i.test(res.body)) {
      const parsed = collectSitemap(res.body);
      sitemap = { found: true, url: candidate, urls: parsed.urls, pages: parsed.pages, isIndex: parsed.isIndex, status: 200, lastmods: parsed.lastmods };
      if (parsed.isIndex) {
        notes.push('El sitemap es un índice de sitemaps: cuenta el número de sitemaps, no de páginas.');
        // En motor profundo se abren hasta 2 sitemaps hijos para tener una población real.
        if (opts.engine === 'deep') {
          const children = parsed.children.slice(0, 2);
          const pages: string[] = [];
          let count = 0;
          for (const child of children) {
            const childRes = await call(child, 'text');
            if (childRes.status !== 200) continue;
            const inner = collectSitemap(childRes.body);
            count += inner.urls;
            pages.push(...inner.pages);
          }
          if (pages.length) {
            sitemap = { ...sitemap, urls: count, pages: pages.slice(0, 2000) };
          }
        }
      }
      break;
    }
    sitemap = { found: false, url: candidate, urls: 0, pages: [], isIndex: false, status: res.status || null };
  }

  // 6. Páginas legales: primero enlaces del menú, después rutas conocidas bajo la raíz del sitio.
  const legal: LegalProbe[] = [];
  const keys: LegalProbe['key'][] = ['privacy', 'terms', 'about', 'contact'];
  let probesLeft = 6;
  const underSiteRoot = (path: string) => `${siteRoot.replace(/\/$/, '')}${path}`;

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
        const res = await call(underSiteRoot(probe), 'html');
        probesLeft--;
        trackFailure(res);
        if (res.status === 200 && res.body.length > 500) {
          found = true;
          url = underSiteRoot(probe);
          status = 200;
          break;
        }
        status = res.status || null;
      }
    }

    if (!found && probesLeft <= 0) verifiable = false;
    legal.push({ key, found, url, status, note, verifiable: found || verifiable });
  }

  const contentPopulation = sitemap.pages.filter((u) => !isUtilityUrl(u)).length || sitemap.urls;

  // 7. Páginas extra (motor profundo): muestra aleatoria reproducible del sitemap.
  const extraPages: AuditContext['extraPages'] = [];
  const brokenLinks: AuditContext['brokenLinks'] = [];
  const sampled: string[] = [];
  const sampleSeed = opts.seed ?? seedFrom(normalized.subject);
  if (opts.engine === 'deep' && home && opts.maxExtraPages > 0) {
    const rawPool = normalizePool(
      sitemap.pages.length
        ? sitemap.pages
        : home.internalLinks.map((l) => l.href),
      siteRoot,
    ).filter((u) => u !== normalized.url);
    const contentPool = rawPool.filter((u) => !isUtilityUrl(u));
    const pool = contentPool.length ? contentPool : rawPool;
    const picked = sampleUrls(pool, opts.maxExtraPages, sampleSeed);
    sampled.push(...picked);
    if (picked.length) notes.push(`Muestra: ${picked.length} de ${pool.length} URLs de contenido (semilla ${sampleSeed}).`);
    for (const url of picked) {
      const res = await call(url, 'html');
      if (!res.ok || res.body.length < 100) {
        if (res.status === 404 || res.status === 410) brokenLinks.push({ url, status: res.status });
        continue;
      }
      const doc = parseHtml(res.body, url, res.headers ?? {});
      extraPages.push({ url, words: doc.wordCount, shingles: shingles(doc.text), latencyMs: res.ms, utility: isUtilityUrl(url) });
    }
  }

  const psi = opts.psiPromise ? await opts.psiPromise : opts.psi;
  const context: AuditContext = {
    input,
    normalized,
    home,
    robots,
    adsTxt,
    sitemap,
    legal,
    psi,
    extraPages,
    brokenLinks,
    adsTxtRecord,
    log,
    notes,
  };

  const canMonetize = canMonetizeWithAdsense(normalized.ownership, normalized.platform);
  const contentPageCount = sitemap.pages.filter((u) => !isUtilityUrl(u)).length;
  const contentPages = contentPageCount > 0 ? contentPageCount : sitemap.urls > 0 ? sitemap.urls : extraPages.length || null;

  const rawSignals = buildSignals(context);
  const score = scoreSignals(rawSignals, { canMonetize });

  const nicheId = opts.nicheId === 'auto'
    ? detectNicheId(home?.title ?? '', home?.metaDescription ?? '', `${home?.text ?? ''}`)
    : opts.nicheId;
  const niche: NicheKey = NICHES.find((n) => n.id === nicheId) ?? NICHES[NICHES.length - 1];

  const mobilePerf = psi.find((p) => p.strategy === 'mobile');
  const perfNorm = mobilePerf?.performance != null ? mobilePerf.performance / 100 : null;
  const pageQuality = perfNorm === null ? 1 : Math.min(1, Math.max(0.75, 0.75 + 0.25 * perfNorm));

  // Un RPM/CTR invalido se ignora con aviso: nunca se propaga un numero absurdo.
  let ownRpm = opts.ownRpm;
  if (ownRpm !== null && (!Number.isFinite(ownRpm) || ownRpm <= 0 || ownRpm > 500)) {
    notes.push('El RPM aportado no es válido (0 < RPM < 500): se usa el rango de industria.');
    ownRpm = null;
  }
  let ownCtr = opts.ownCtr;
  if (ownCtr !== null && (!Number.isFinite(ownCtr) || ownCtr <= 0 || ownCtr > 0.25)) {
    notes.push('El CTR aportado no es válido (0 < CTR < 0,25): se usa el valor de industria.');
    ownCtr = null;
  }

  const monetization = project({
    sessions: opts.sessions,
    pagesPerVisit: 1.4,
    niche: { id: niche.id, label: niche.label, rpm: niche.rpm, ctr: niche.ctr },
    country: opts.country,
    mobileShare: opts.mobileShare,
    ownRpm,
    ownCtr,
    perfNorm,
    contentPages,
  });

  const avgWords = extraPages.filter((p) => !p.utility).length
    ? Math.round(extraPages.filter((p) => !p.utility).reduce((a, p) => a + p.words, 0) / extraPages.filter((p) => !p.utility).length)
    : home?.wordCount ?? null;

  const economics = computeEconomics({
    sessions: opts.sessions,
    pagesPerVisit: 1.4,
    rpm: { low: monetization.rpm.low, base: monetization.rpm.base, high: monetization.rpm.high },
    contentPages,
    avgWords,
    currentRpm: ownRpm,
    canMonetize,
  });

  const attribution = attributeLoss({
    signals: score.signals,
    gates: score.gates,
    economics,
    pageQuality,
    mobileShare: opts.mobileShare,
    canMonetize,
  });

  const publicData = opts.publicData ? await collectPublicData(normalized) : undefined;

  const approval = computeApproval({
    score: score.score,
    confidence: score.confidence,
    gates: score.gates,
    signals: score.signals,
    ownership: normalized.ownership,
    platform: normalized.platform,
    contentPages: contentPages ?? 0,
    domainAgeYears: publicData?.rdap?.ageYears ?? null,
    adsCode: home?.adsCode ?? false,
    expectedMonthly: economics.expectedMonthly,
    fixHours: attribution.items.reduce((a, item) => a + item.hours, 0),
  });

  const stats = analyze({
    home: home ? { words: home.wordCount } : null,
    pages: extraPages.filter((p) => !p.utility).map((p) => ({ url: p.url, words: p.words, latencyMs: p.latencyMs })),
    population: contentPopulation,
    seed: sampleSeed,
  });

  return {
    schema: 'report.v2',
    createdAt: new Date().toISOString(),
    engine: opts.engine,
    target: normalized,
    title: home?.title ?? '',
    score,
    blocked: score.gates.some((g) => g.triggered && (g.id === 'unreachable' || g.id === 'parked')),
    facts: {
      host: normalized.host,
      subject: normalized.subject,
      ownership: normalized.ownership,
      canMonetize,
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
      wordsPerPage: avgWords,
      sitemapUrls: sitemap.urls,
      sitemapPages: sitemap.pages.length,
      contentPages: contentPages ?? 0,
      sampleSeed: opts.engine === 'deep' ? sampleSeed : null,
      sampledUrls: sampled.length ? sampled.join(' ') : null,
      niche: niche.label,
      adsTxt: adsTxtRecord ? adsTxtRecord.valid : false,
      adsCodeDetected: home?.adsCode ?? false,
      pubId: home?.pubIds[0] ?? null,
      requests: log.length,
      expectedMonthly: round2(economics.expectedMonthly),
      gapMonthly: round2(economics.gapMonthly),
      approvalBase: round2(approval.probability.base * 100),
      domainAgeYears: publicData?.rdap?.ageYears ?? null,
    },
    monetization,
    economics,
    attribution,
    approval,
    publicData,
    stats: stats ?? undefined,
    meta: {
      requests: log.length,
      durationMs: Date.now() - started,
      providers: Array.from(new Set(log.map((l) => l.provider))),
      notes,
      unknowns: score.unknowns,
    },
  };
}
