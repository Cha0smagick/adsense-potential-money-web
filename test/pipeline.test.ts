import { describe, expect, it } from 'vitest';
import type { Fetcher, FetchResult } from '../src/core/types.ts';
import { runAudit } from '../src/core/audit.ts';
import { normalizeUrl } from '../src/core/normalize.ts';
import { FIX_ALLOWED_DOMAINS } from '../src/core/remediation.ts';

const paragraph = 'La fotosíntesis convierte la luz solar en energía química y permite que las plantas crezcan. ';

function article(extra = ''): string {
  const body = Array.from({ length: 70 }, () => paragraph).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Jardinería en casa</title>
<meta name="description" content="Guías de jardinería para principiantes con ejemplos reales y explicaciones claras.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://miweb.com/">
<link rel="icon" href="/favicon.ico">
</head><body><h1>Jardinería en casa</h1><h2>Riego</h2><h2>Sustrato</h2>
<nav><a href="/privacidad">Privacidad</a><a href="/contacto">Contacto</a><a href="/sobre">Sobre</a>
<a href="/terminos">Términos</a><a href="/guias">Guías</a></nav>
<p>${body}</p>${extra}</body></html>`;
}

function makeFetcher(overrides: Record<string, Partial<FetchResult>> = {}): Fetcher {
  const base = (o: Partial<FetchResult>): FetchResult => ({
    ok: true,
    status: 200,
    body: '',
    provider: 'fake',
    ms: 1,
    bytes: 0,
    ...o,
  });
  return async (url) => {
    const override = overrides[url];
    if (override) return base(override);
    const path = new URL(url).pathname;
    if (path === '/robots.txt' || path === '/ads.txt' || path === '/sitemap.xml') {
      return base({ ok: false, status: 404 });
    }
    return base({ status: 200, body: article() });
  };
}

function signal(report: Awaited<ReturnType<typeof runAudit>>, id: string) {
  const found = report.score.signals.find((s) => s.id === id);
  if (!found) throw new Error(`No existe la señal ${id}`);
  return found;
}

describe('runAudit: casos límite', () => {
  it('robots.txt con 5xx no se declara permitido: queda sin datos', async () => {
    const fetcher = makeFetcher({
      'https://miweb.com/robots.txt': { ok: false, status: 500, body: '' },
    });
    const report = await runAudit(fetcher, 'https://miweb.com/', { sessions: 1000 });
    expect(signal(report, 'crawl-mediapartners').status).toBe('unknown');
    expect(signal(report, 'crawl-adsbot').status).toBe('unknown');
  });

  it('si HTTPS no responde, audita la versión HTTP', async () => {
    const fetcher = makeFetcher({
      'https://miweb.com/': { ok: false, status: 0, note: 'TLS fallido' },
    });
    const report = await runAudit(fetcher, 'https://miweb.com/', { sessions: 1000 });
    expect(report.target.https).toBe(false);
    expect(signal(report, 'content-reachable').status).toBe('pass');
    expect(signal(report, 'crawl-https').status).toBe('fail');
    expect(report.meta.notes.join(' ')).toContain('HTTP');
  });

  it('usa la URL final cuando el sitio redirige a otro host', async () => {
    const fetcher = makeFetcher({
      'https://miweb.com/': { finalUrl: 'https://otrohost.com/blog/', body: article() },
    });
    const report = await runAudit(fetcher, 'https://miweb.com/', { sessions: 1000 });
    expect(report.target.host).toBe('otrohost.com');
    expect(report.target.siteRoot).toBe('https://otrohost.com/');
    expect(report.meta.notes.join(' ')).toContain('redirige');
    expect(signal(report, 'ux-nav').status).not.toBe('fail');
  });

  it('ignora un RPM o CTR imposibles y lo avisa', async () => {
    const report = await runAudit(makeFetcher(), 'https://miweb.com/', { sessions: 1000, ownRpm: -5, ownCtr: 9 });
    expect(report.monetization.rpm.base).toBeGreaterThan(0);
    expect(report.meta.notes.join(' ')).toContain('RPM aportado');
    expect(report.meta.notes.join(' ')).toContain('CTR aportado');
  });

  it('muestrea el sitemap de forma reproducible y lo publica', async () => {
    const locs = Array.from({ length: 20 }, (_, i) => `<url><loc>https://miweb.com/p/${i + 1}</loc></url>`).join('');
    const fetcher = makeFetcher({
      'https://miweb.com/sitemap.xml': { status: 200, body: `<?xml version="1.0"?><urlset>${locs}</urlset>` },
    });
    const a = await runAudit(fetcher, 'https://miweb.com/', { engine: 'deep', maxExtraPages: 5, seed: 42 });
    const b = await runAudit(fetcher, 'https://miweb.com/', { engine: 'deep', maxExtraPages: 5, seed: 42 });
    expect(a.facts.sampledUrls).toBeTruthy();
    expect(String(a.facts.sampledUrls).split(' ')).toHaveLength(5);
    expect(a.facts.sampledUrls).toBe(b.facts.sampledUrls);
    expect(a.facts.sampleSeed).toBe(42);
    expect(a.meta.notes.join(' ')).toContain('Muestra: 5 de 20');
  });

  it('el informe v2 llega con dinero, atribución y aprobación', async () => {
    const report = await runAudit(makeFetcher(), 'https://miweb.com/', { sessions: 1000, country: 'ES' });
    expect(report.schema).toBe('report.v2');
    expect(report.economics.expectedMonthly).toBeGreaterThan(0);
    expect(report.attribution.totals.all).toBeGreaterThanOrEqual(0);
    expect(report.approval.probability.base).toBeGreaterThan(0);
    expect(report.approval.notes.length).toBeGreaterThan(0);
  });

  it('toda señal y todo bloqueador trae enlace de arreglo con dominio permitido', async () => {
    const report = await runAudit(makeFetcher(), 'https://miweb.com/', { sessions: 1000 });
    for (const s of report.score.signals) {
      expect(s.fix, `señal sin enlace: ${s.id}`).toBeTruthy();
      expect(s.fix!.url).toMatch(/^https:\/\//);
      const host = new URL(s.fix!.url).hostname;
      expect(FIX_ALLOWED_DOMAINS, `dominio no permitido en ${s.id}: ${host}`).toContain(host);
    }
    for (const g of report.score.gates) {
      expect(g.fix, `gate sin enlace: ${g.id}`).toBeTruthy();
    }
  });
});

describe('normalizeUrl: plataformas compartidas y project pages', () => {
  it('detecta un project page de GitHub y separa la subruta', () => {
    const n = normalizeUrl('https://cha0smagick.github.io/adsense-potential-money-web/');
    expect(n.platform).toBe('github-pages');
    expect(n.ownership).toBe('platform');
    expect(n.siteRoot).toBe('https://cha0smagick.github.io/adsense-potential-money-web/');
    expect(n.basePath).toBe('/adsense-potential-money-web/');
    expect(n.subject).toBe('cha0smagick.github.io/adsense-potential-money-web');
    expect(n.slug).toBe('cha0smagick-github-io-adsense-potential-money-web');
  });

  it('la raíz de user.github.io es el sitio completo', () => {
    const n = normalizeUrl('https://cha0smagick.github.io/');
    expect(n.siteRoot).toBe('https://cha0smagick.github.io/');
    expect(n.basePath).toBe('/');
  });

  it('blogspot y wordpress.com son plataforma; un dominio propio no', () => {
    expect(normalizeUrl('https://miblog.blogspot.com').ownership).toBe('platform');
    expect(normalizeUrl('https://miblog.blogspot.com').platform).toBe('blogspot');
    expect(normalizeUrl('https://miweb.wordpress.com').ownership).toBe('platform');
    expect(normalizeUrl('https://miweb.com').ownership).toBe('owned');
  });

  it('un enlace a otra carpeta del mismo github.io no es interno', async () => {
    const { isInternalUrl } = await import('../src/core/normalize.ts');
    const page = 'https://cha0smagick.github.io/adsense-potential-money-web/';
    expect(isInternalUrl(page, '/adsense-potential-money-web/guias')).toBe(true);
    expect(isInternalUrl(page, 'https://cha0smagick.github.io/otro-repo/')).toBe(false);
  });
});
