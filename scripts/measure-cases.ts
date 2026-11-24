import { readFile, writeFile } from 'node:fs/promises';
import type { Fetcher, FetchResult } from '../src/core/types.ts';
import { runAudit } from '../src/core/audit.ts';
import { safeFetch } from '../src/deep/ssrf.ts';

// Mide con el auditor los casos públicos de aprobación/rechazo. Solo guarda
// URL, resultado, fecha, fuente y las señales del auditor. No guarda usuarios.

const UA = 'Mozilla/5.0 (compatible; AdsenseAuditor/2.0; +https://cha0smagick.github.io/adsense-potential-money-web/)';

const direct: Fetcher = async (url, kind) => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'text/plain,*/*',
        'accept-language': 'es,en;q=0.8',
      },
    });
    const body = await res.text();
    const xRobots = res.headers.get('x-robots-tag') ?? '';
    const headers: Record<string, string> = {};
    if (xRobots) headers['x-robots-tag'] = xRobots;
    return {
      ok: res.ok,
      status: res.status,
      body,
      provider: 'direct',
      ms: Date.now() - started,
      bytes: Buffer.byteLength(body),
      finalUrl: res.url,
      headers,
    } satisfies FetchResult;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      provider: 'direct',
      ms: Date.now() - started,
      bytes: 0,
      note: error instanceof Error ? error.message : 'fetch fallido',
    } satisfies FetchResult;
  } finally {
    clearTimeout(timer);
  }
};

interface Case {
  id: string;
  site: string;
  outcome: 'approved' | 'rejected';
  date: string;
  reason: string;
  kind: string;
  source: string;
}

const cases = JSON.parse(await readFile('data/approval-cases.json', 'utf8')) as Case[];
const measured = [];

for (const c of cases) {
  try {
    const report = await runAudit(direct, c.site, {
      engine: 'deep',
      sessions: 5000,
      country: 'US',
      maxExtraPages: 4,
      publicData: false,
    });
    const policyFails = report.score.signals.filter((s) => s.category === 'policy' && s.status === 'fail').length;
    const gates = report.score.gates.filter((g) => g.triggered).map((g) => g.id);
    measured.push({
      ...c,
      reachable: true,
      title: report.title,
      score: report.score.score,
      confidence: report.score.confidence,
      verdict: report.score.verdict.band,
      gates,
      policyFails,
      contentPages: report.facts.contentPages,
      words: report.facts.words,
      adsCode: report.facts.adsCodeDetected,
      canMonetize: report.facts.canMonetize,
      approvalBase: report.approval.probability.base,
    });
    console.log(
      `${c.outcome.padEnd(8)} ${String(report.score.score).padStart(5)} | gates=${gates.join(',') || '—'} | pol=${policyFails} | ads=${report.facts.adsCodeDetected ? 'sí' : 'no'} | ${c.site}`,
    );
  } catch (error) {
    measured.push({ ...c, reachable: false, error: error instanceof Error ? error.message : String(error) });
    console.log(`${c.outcome.padEnd(8)} ERROR | ${c.site} | ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 800));
}

await writeFile('data/approval-cases.measured.json', JSON.stringify(measured, null, 2), 'utf8');
console.log(`\nMedidos: ${measured.length} (${measured.filter((m) => m.reachable).length} accesibles)`);
