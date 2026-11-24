import { readFile, writeFile } from 'node:fs/promises';
import type { Fetcher, FetchResult } from '../src/core/types.ts';
import { runAudit } from '../src/core/audit.ts';
import { normalizeUrl } from '../src/core/normalize.ts';
import { safeFetch } from '../src/deep/ssrf.ts';

// Mide con el auditor ligero los sitios de rechazos públicos. Un rechazo que hoy
// muestra código de AdSense queda marcado como "stale" y se excluye de la calibración.

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

async function readJson(path: string): Promise<any[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as any[];
  } catch {
    return [];
  }
}

const sources = [
  { path: 'data/approval-cases.json', site: (x: any) => x.site, outcome: (x: any) => x.outcome },
  { path: 'data/raw/forum-cases-38.json', site: (x: any) => x.sites?.[0], outcome: (x: any) => x.outcome },
  { path: 'data/raw/wayback-cases.json', site: (x: any) => x.sites?.[0], outcome: (x: any) => x.outcome },
  { path: 'data/raw/forum-cases.json', site: (x: any) => x.sites?.[0], outcome: (x: any) => x.outcome },
];

const byHost = new Map<string, { site: string; outcome: string; source: string; title?: string }>();
for (const src of sources) {
  for (const row of await readJson(src.path)) {
    if (src.outcome(row) !== 'rejected') continue;
    const site = src.site(row);
    if (!site) continue;
    try {
      const n = normalizeUrl(site);
      if (!byHost.has(n.host)) byHost.set(n.host, { site: n.url, outcome: 'rejected', source: src.path, title: row.title });
    } catch {
      /* URL inválida */
    }
  }
}

const targets = Array.from(byHost.values());
console.log(`Sitios de rechazo únicos: ${targets.length}`);

const results: any[] = [];
let done = 0;
let index = 0;
async function worker() {
  while (index < targets.length) {
    const t = targets[index++];
    try {
      const report = await runAudit(direct, t.site, {
        engine: 'fast',
        sessions: 5000,
        country: 'US',
        maxExtraPages: 0,
        publicData: false,
        skipAdsTxt: true,
        maxLegalProbes: 4,
      });
      results.push({
        ...t,
        reachable: true,
        title: report.title,
        score: report.score.score,
        confidence: report.score.confidence,
        gates: report.score.gates.filter((g) => g.triggered).map((g) => g.id),
        words: report.facts.words,
        contentPages: report.facts.contentPages,
        privacy: report.score.signals.find((s) => s.id === 'essential-privacy')?.status ?? null,
        adsCode: report.facts.adsCodeDetected,
        stale: report.facts.adsCodeDetected === true,
        canMonetize: report.facts.canMonetize,
      });
      console.log(`${t.site} -> ${report.score.score} | ads=${report.facts.adsCodeDetected ? 'sí (stale)' : 'no'}`);
    } catch (error) {
      results.push({ ...t, reachable: false, error: error instanceof Error ? error.message : String(error) });
      console.log(`${t.site} -> ERROR`);
    }
    done++;
    if (done % 10 === 0) await writeFile('data/raw/negatives-measured.json', JSON.stringify(results, null, 2), 'utf8');
  }
}

await Promise.all(Array.from({ length: 6 }, () => worker()));
await writeFile('data/raw/negatives-measured.json', JSON.stringify(results, null, 2), 'utf8');
console.log(`FIN: ${results.length}, con score ${results.filter((r) => typeof r.score === 'number').length}`);
