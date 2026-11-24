import { readFile, writeFile } from 'node:fs/promises';
import type { Fetcher, FetchResult } from '../src/core/types.ts';
import { runAudit } from '../src/core/audit.ts';
import { normalizeUrl } from '../src/core/normalize.ts';
import { xorshift32 } from '../src/core/sample.ts';
import { safeFetch } from '../src/deep/ssrf.ts';

// Escanea una muestra aleatoria de Tranco, detecta sitios que HOY sirven AdSense
// (positivos verificables) y mide su score con el auditor. No usa APIs de pago.

const UA = 'Mozilla/5.0 (compatible; AdsenseAuditor/2.0; +https://cha0smagick.github.io/adsense-potential-money-web/)';
const START_RANK = Number(process.env.START_RANK ?? 0);
const SAMPLE = Number(process.env.SAMPLE ?? 7000);
const MAX_POSITIVES = Number(process.env.MAX_POSITIVES ?? 260);
const CONCURRENCY = 12;

const lines = (await readFile('data/raw/top-1m.csv', 'utf8')).trim().split('\n').slice(1);
const ranked = lines.slice(START_RANK).map((l) => l.split(',')[1]).filter(Boolean);
const domains = ranked;
const rand = xorshift32(20261124 + START_RANK);
for (let i = 0; i < domains.length; i++) {
  const j = i + Math.floor(rand() * (domains.length - i));
  [domains[i], domains[j]] = [domains[j], domains[i]];
}
const sample = domains.slice(0, SAMPLE);

async function direct(url: string, kind: 'html' | 'text'): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'text/plain,*/*',
        'accept-language': 'en,es;q=0.8',
      },
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body,
      provider: 'direct',
      ms: Date.now() - started,
      bytes: Buffer.byteLength(body),
      finalUrl: res.url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      provider: 'direct',
      ms: Date.now() - started,
      bytes: 0,
      note: error instanceof Error ? error.message : 'fetch fallido',
    };
  } finally {
    clearTimeout(timer);
  }
}

const results: Record<string, unknown>[] = JSON.parse(
  await readFile('data/raw/tranco-scan.json', 'utf8').catch(() => '[]'),
);
const seen = new Set(results.map((r) => r.domain).filter(Boolean) as string[]);
let scanned = 0;
let positives = results.filter((r) => r.adsense === true && typeof r.score === 'number').length;
let index = 0;

async function worker() {
  while (index < sample.length && positives < MAX_POSITIVES) {
    const domain = sample[index++];
    if (seen.has(domain)) continue;
    seen.add(domain);
    scanned++;
    let url: string;
    try {
      url = normalizeUrl(`https://${domain}`).url;
    } catch {
      continue;
    }
    const home = await direct(url, 'html');
    if (!home.ok || home.body.length < 500) {
      if (scanned % 50 === 0) await persist();
      continue;
    }
    const adsense = /ca-pub-\d{10,}|adsbygoogle|pagead2\.googlesyndication\.com/i.test(home.body);
    if (!adsense) {
      if (scanned % 50 === 0) await persist();
      continue;
    }
    positives++;
    try {
      const normalized = normalizeUrl(url);
      const cached: FetchResult = { ...home, provider: 'cache', ms: 0 };
      const fetcher: Fetcher = async (u, k) => (u === normalized.url && k === 'html' ? cached : direct(u, k));
      const report = await runAudit(fetcher, url, {
        engine: 'fast',
        sessions: 5000,
        country: 'US',
        maxExtraPages: 0,
        publicData: false,
        skipAdsTxt: true,
        maxLegalProbes: 4,
      });
      results.push({
        domain,
        url,
        adsense: true,
        score: report.score.score,
        confidence: report.score.confidence,
        gates: report.score.gates.filter((g) => g.triggered).map((g) => g.id),
        words: report.facts.words,
        contentPages: report.facts.contentPages,
        privacy: report.score.signals.find((s) => s.id === 'essential-privacy')?.status ?? null,
        canMonetize: report.facts.canMonetize,
        title: report.title,
      });
    } catch (error) {
      results.push({ domain, url, adsense: true, error: error instanceof Error ? error.message : String(error) });
    }
    if (positives % 10 === 0) {
      console.log(`scanned=${scanned} positives=${positives}`);
      await persist();
    }
  }
}

let writing = false;
async function persist() {
  if (writing) return;
  writing = true;
  try {
    await writeFile('data/raw/tranco-scan.json', JSON.stringify(results, null, 2), 'utf8');
  } finally {
    writing = false;
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
await persist();
const ok = results.filter((r) => typeof r.score === 'number');
console.log(`\nFIN scanned=${scanned} positives=${positives} measured=${ok.length}`);
