import { mkdir, writeFile } from 'node:fs/promises';
import type { Fetcher, FetchResult } from '../core/types.ts';
import { runAudit } from '../core/audit.ts';
import { normalizeUrl } from '../core/normalize.ts';

// Ejecutor del motor profundo. Corre en GitHub Actions (o en local) sin CORS,
// sin proxies y sin dependencias: fetch nativo de Node 22+.

const UA = 'Mozilla/5.0 (compatible; AdsenseAuditor/1.0; +https://github.com/)';

const direct: Fetcher = async (url, kind) => {
  const once = async (): Promise<FetchResult> => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'text/plain,*/*',
          'accept-language': 'es,en;q=0.8',
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

  // Un fallo de red transitorio no debe convertirse en "sitio inaccesible".
  const first = await once();
  if (first.status !== 0) return first;
  await new Promise((r) => setTimeout(r, 1200));
  return once();
};

function arg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main() {
  const target = process.argv[2];
  if (!target || target.startsWith('--')) {
    console.error('Uso: npm run audit -- <url> [--sessions 5000] [--niche auto] [--country US] [--pages 12] [--out reports/x.json]');
    process.exit(1);
  }

  const sessions = Number(arg('sessions', '5000')) || 5000;
  const pages = Math.min(20, Math.max(0, Number(arg('pages', '12')) || 0));

  // El workflow acepta cualquier URL: se rechaza lo que apunta a la red interna.
  const normalized = normalizeUrl(target);
  const host = normalized.host;
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(host) || /^(10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local')) {
    throw new Error(`URL no permitida (red interna): ${host}`);
  }

  const report = await runAudit(direct, target, {
    engine: 'deep',
    sessions,
    nicheId: arg('niche', 'auto'),
    country: arg('country', 'US'),
    maxExtraPages: pages,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = arg('out', `reports/${report.target.registrable}-${stamp}.json`);
  await mkdir('reports', { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2), 'utf8');

  const s = report.score;
  console.log(`\n${report.title || report.target.host}`);
  console.log(`${s.score}/100  ·  ${s.verdict.label}  ·  confianza ${(s.confidence * 100).toFixed(0)}%`);
  console.log(`categorías: ${s.categories.map((c) => `${c.label.split(' ')[0]} ${c.score === null ? '—' : Math.round(c.score * 100)}`).join(' | ')}`);
  const blockers = s.gates.filter((g) => g.triggered);
  if (blockers.length) console.log(`bloqueadores: ${blockers.map((b) => `${b.label} (tope ${b.cap})`).join('; ')}`);
  console.log(`nicho detectado: ${report.facts.niche}  ·  RPM base ${report.monetization.rpm.base} USD`);
  console.log(`peticiones: ${report.meta.requests} en ${report.meta.durationMs} ms  ·  ${out}\n`);

  const top = [...s.signals].filter((x) => x.status !== 'pass' && x.status !== 'unknown').sort((a, b) => b.impact - a.impact).slice(0, 5);
  for (const t of top) console.log(`  [${t.status}] +${t.impact} → ${t.label}: ${t.evidence}`);
}

main().catch((error) => {
  console.error('Fallo la auditoría:', error instanceof Error ? error.message : error);
  process.exit(1);
});
