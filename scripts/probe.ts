import { createBrowserFetcher } from '../src/fetch/chain.ts';
import { runAudit } from '../src/core/audit.ts';

// Prueba el MISMO codigo de cadena de proveedores que usa el navegador, ejecutado en
// Node (donde CORS no aplica). Verifica que jina/allorigins devuelven HTML usable y
// que el pipeline puntua. No sustituye la prueba en navegador: alli manda CORS.

const url = process.argv[2];
if (!url) {
  console.error('Uso: npm run probe -- https://midominio.com');
  process.exit(1);
}

const { fetcher, state } = createBrowserFetcher(20);
const report = await runAudit(fetcher, url, { engine: 'fast', sessions: 10000, nicheId: 'auto', country: 'ES' });

console.log(`\n${report.title || report.target.host}`);
console.log(`${report.score.score}/100 · ${report.score.verdict.label} · confianza ${(report.score.confidence * 100).toFixed(0)}%`);
console.log(`proveedores usados: ${report.meta.providers.join(', ')}`);
console.log(`peticiones: ${report.meta.requests} (presupuesto ${state.budget}, errores: ${state.lastError ?? 'ninguno'})`);
console.log(`portada: ${report.facts.words} palabras · texto/marcado ${(report.score.signals.find((s) => s.id === 'content-text-ratio')?.value ?? '')}`);
console.log(`bloqueadores: ${report.score.gates.filter((g) => g.triggered).map((g) => g.label).join('; ') || 'ninguno'}`);
console.log(`desglose: ${report.score.categories.map((c) => `${c.label} ${c.score === null ? 's/d' : Math.round(c.score * 100)}`).join(' | ')}\n`);
