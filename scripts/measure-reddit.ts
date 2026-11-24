import { readFile, writeFile } from 'node:fs/promises';
import type { Fetcher, FetchResult } from '../src/core/types.ts';
import { runAudit } from '../src/core/audit.ts';
import { normalizeUrl } from '../src/core/normalize.ts';
import { safeFetch } from '../src/deep/ssrf.ts';

// Mide los sitios de Reddit (aprobados y rechazados) con el auditor ligero.
// Un rechazo que hoy muestra AdSense queda como "stale" y se excluye.

const UA = 'Mozilla/5.0 (compatible; AdsenseAuditor/2.0; +https://cha0smagick.github.io/adsense-potential-money-web/)';

async function direct(url: string, kind: 'html' | 'text'): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: kind === 'html' ? 'text/html' : 'text/plain,*/*', 'accept-language': 'en,es;q=0.8' },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, provider: 'direct', ms: Date.now() - started, bytes: Buffer.byteLength(body), finalUrl: res.url };
  } catch (error) {
    return { ok: false, status: 0, body: '', provider: 'direct', ms: Date.now() - started, bytes: 0, note: error instanceof Error ? error.message : 'fetch fallido' };
  } finally {
    clearTimeout(timer);
  }
}

const cases = JSON.parse(await readFile('data/raw/reddit-cases.json', 'utf8')) as {
  id: string; site: string; host: string; title: string; created: number; outcome: string; source: string;
}[];
console.log(`casos a medir: ${cases.length}`);

const results: any[] = [];
let index = 0;
let done = 0;
async function worker() {
  while (index < cases.length) {
    const c = cases[index++];
    try {
      const normalized = normalizeUrl(c.site);
      const report = await runAudit(direct, c.site, {
        engine: 'fast',
        sessions: 5000,
        country: 'US',
        maxExtraPages: 0,
        publicData: false,
        skipAdsTxt: true,
        maxLegalProbes: 4,
      });
      const words = report.facts.words as number;
      const gates = report.score.gates.filter((g) => g.triggered).map((g) => g.id);
      const adsCode = report.facts.adsCodeDetected === true;
      results.push({
        ...c,
        url: normalized.url,
        title: report.title || c.title,
        reachable: words > 0 && !gates.includes('unreachable'),
        score: report.score.score,
        confidence: report.score.confidence,
        gates,
        words,
        contentPages: report.facts.contentPages,
        privacy: report.score.signals.find((s) => s.id === 'essential-privacy')?.status ?? null,
        adsCode,
        stale: c.outcome === 'rejected' && adsCode,
        canMonetize: report.facts.canMonetize,
      });
    } catch (error) {
      results.push({ ...c, reachable: false, error: error instanceof Error ? error.message : String(error) });
    }
    done++;
    if (done % 20 === 0) {
      console.log(`${done}/${cases.length} · medidos=${results.filter((r) => typeof r.score === 'number').length} · stale=${results.filter((r) => r.stale).length}`);
      await writeFile('data/raw/reddit-measured.json', JSON.stringify(results, null, 2), 'utf8');
    }
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));
await writeFile('data/raw/reddit-measured.json', JSON.stringify(results, null, 2), 'utf8');
const ok = results.filter((r) => typeof r.score === 'number');
console.log(`FIN: ${results.length}, con score ${ok.length}, stale ${results.filter((r) => r.stale).length}`);
