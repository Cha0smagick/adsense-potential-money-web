import type { AuditReport, CategoryScore, SignalResult } from '../core/types.ts';
import { CATEGORY_META } from '../core/score.ts';
import { POLICY_CATEGORIES } from '../core/lexicon.ts';
import { gaugeSvg, legend, revenueChart } from './charts.ts';

export const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

const nf = new Intl.NumberFormat('es-ES');
export const num = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? '—' : nf.format(Math.round(n)));
export const usd = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(digits)} USD`;
export const pct = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(digits)}%`;

const STATUS_LABEL: Record<SignalResult['status'], string> = { pass: 'ok', warn: 'aviso', fail: 'fallo', unknown: 'sin datos' };
const PLATFORM_LABEL: Record<string, string> = {
  blogspot: 'Blogspot', 'wordpress.com': 'WordPress.com', wix: 'Wix', shopify: 'Shopify', ghost: 'Ghost',
  webflow: 'Webflow', squarespace: 'Squarespace', joomla: 'Joomla', drupal: 'Drupal', prestashop: 'PrestaShop',
  magento: 'Magento', unknown: 'dominio propio',
};

function scoreClass(score: number | null): string {
  if (score === null) return '';
  if (score < 0.5) return 'low';
  if (score < 0.75) return 'mid';
  return '';
}

function hero(r: AuditReport): string {
  const s = r.score;
  const cap = s.verdict.capApplied !== null ? ` · tope ${s.verdict.capApplied}` : '';
  return `<section class="card report-hero">
  <div class="report-title print-only"><h1>Auditoría AdSense — ${esc(r.target.host)}</h1>
    <p>${esc(new Date(r.createdAt).toLocaleString('es-ES'))} · motor ${esc(r.engine)} · schema ${esc(r.schema)}</p></div>
  <div class="hero">
    <div class="gauge-wrap">${gaugeSvg(s.score, s.verdict.band)}<div class="val"><div><b>${s.score.toFixed(1)}</b><small>de 100${cap}</small></div></div></div>
    <div class="verdict">
      <h2 class="band-${s.verdict.band}">${esc(s.verdict.label)}</h2>
      <p>${esc(s.verdict.summary)}</p>
      <div class="meta-row">
        <span>confianza <b>${pct(s.confidence, 0)}</b></span>
        <span>señales sin datos <b>${s.unknowns.length}</b></span>
        <span>peticiones <b>${r.meta.requests}</b></span>
        <span>tiempo <b>${(r.meta.durationMs / 1000).toFixed(1)} s</b></span>
        <span>motor <b>${esc(r.engine)}</b></span>
      </div>
    </div>
  </div>
  ${blockers(r)}
  ${categories(r.score.categories)}
</section>`;
}

function blockers(r: AuditReport): string {
  const hit = r.score.gates.filter((g) => g.triggered);
  if (!hit.length) return `<p class="notice" style="border-left-color:#22c07f">Sin bloqueadores activos. Ningún tope limita la puntuación.</p>`;
  return `<ul class="blockers">${hit
    .map((g) => `<li><b>Bloqueador: ${esc(g.label)}</b> — puntuación limitada a ${g.cap}/100<span>${esc(g.why)}</span></li>`)
    .join('')}</ul>`;
}

function categories(cats: CategoryScore[]): string {
  return `<div class="cats">${cats
    .map((c) => {
      const value = c.score === null ? null : c.score * 100;
      return `<div class="cat ${scoreClass(c.score)}">
      <span>${esc(c.label)} <small style="color:#7d8b87">· ${c.weight} pts</small></span>
      <span class="track"><span class="fill" style="width:${value === null ? 0 : Math.round(value)}%"></span></span>
      <span class="num">${value === null ? 's/d' : Math.round(value)}</span>
    </div>`;
    })
    .join('')}</div>`;
}

function plan(r: AuditReport): string {
  const top = r.score.signals
    .filter((s) => s.status === 'fail' || s.status === 'warn')
    .sort((a, b) => b.impact - a.impact || (a.status === 'fail' ? -1 : 1))
    .slice(0, 8);
  if (!top.length) return '';
  return `<section class="card"><h2>Plan de acción priorizado <span class="hint">ordenado por puntos que recuperas</span></h2>
  <div class="table-scroll"><table><thead><tr><th style="width:54px">Ganancia</th><th>Acción</th><th style="width:96px">Categoría</th></tr></thead><tbody>
  ${top
    .map((s) => `<tr><td class="num" style="color:#25d0a0">+${s.impact.toFixed(1)}</td>
      <td><b>${esc(s.label)}</b><div style="color:#93a7a1;font-size:12.5px;margin-top:3px">${esc(s.advice)}</div></td>
      <td>${esc(CATEGORY_META.find((c) => c.id === s.category)?.label ?? s.category)}</td></tr>`)
    .join('')}
  </tbody></table></div></section>`;
}

function money(r: AuditReport): string {
  const m = r.monetization;
  return `<section class="card page-break"><h2>Potencial de ingresos <span class="hint">modelo determinista con supuestos declarados</span></h2>
  <div class="kpis">
    <div class="kpi"><small>RPM base</small><b>${usd(m.rpm.base, 2)}</b><span>rango ${usd(m.rpm.low, 2)} – ${usd(m.rpm.high, 2)}</span></div>
    <div class="kpi"><small>CTR estimado</small><b>${pct(m.ctr, 2)}</b><span>${num(m.clicksMonth)} clics/mes</span></div>
    <div class="kpi"><small>Ingreso mes actual</small><b>${usd((m.pageviewsMonth / 1000) * m.rpm.base)}</b><span>${num(m.pageviewsMonth)} páginas vistas</span></div>
    <div class="kpi"><small>CPC implícito</small><b>${usd(m.impliedCpc, 2)}</b><span>${num(m.impressionsMonth)} impresiones</span></div>
  </div>
  <div class="table-scroll" style="margin-top:16px">
  <table><thead><tr><th>Horizonte</th><th class="num">Pesimista</th><th class="num">Base</th><th class="num">Optimista</th><th class="num">Acumulado base</th></tr></thead><tbody>
  ${m.horizons
    .map((h) => `<tr><td>${h.months === 1 ? '1 mes' : h.months === 60 ? '5 años (60 meses)' : `${h.months} meses`}</td>
      <td class="num">${usd(h.pessimistic)}/mes</td><td class="num"><b>${usd(h.base)}</b>/mes</td>
      <td class="num">${usd(h.optimistic)}/mes</td><td class="num">${usd(h.cumulative)}</td></tr>`)
    .join('')}
  </tbody></table></div>
  <div class="chart">${revenueChart(m.scenarios)}${legend()}</div>
  <div class="notice">Para <b>${usd(m.inverse.revenueTarget)}/mes</b> necesitas unas <b>${num(m.inverse.sessionsNeeded)} sesiones/mes</b>
  (≈ <b>${num(m.inverse.pagesNeeded)} páginas</b> de contenido a 400 sesiones por página). Con tu RPM actual, eso es la meta operativa.</div>
  <ul class="assumptions">${m.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  </section>`;
}

function signals(r: AuditReport): string {
  const order = ['fail', 'warn', 'unknown', 'pass'] as const;
  return `<section class="card page-break"><h2>Señales evaluadas <span class="hint">${r.score.signals.length} comprobaciones con su evidencia</span></h2>
  ${CATEGORY_META.map((meta) => {
    const own = r.score.signals
      .filter((s) => s.category === meta.id)
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.impact - a.impact);
    if (!own.length) return '';
    return `<div class="sig-group"><h3>${esc(meta.label)} · peso ${meta.weight}</h3>
    ${own
      .map(
        (s) => `<div class="sig"><div><span class="chip ${s.status}">${STATUS_LABEL[s.status]}</span></div>
      <div class="body"><b>${esc(s.label)}</b>${s.value ? `<span class="val">${esc(s.value)}</span>` : ''}${s.impact > 0 ? `<span class="gain">+${s.impact.toFixed(1)} pts</span>` : ''}
      <div class="ev">${esc(s.evidence)}</div>
      ${s.status !== 'pass' ? `<div class="adv">${esc(s.advice)}</div>` : ''}</div></div>`,
      )
      .join('')}
    </div>`;
  }).join('')}
  </section>`;
}

function facts(r: AuditReport): string {
  const f = r.facts;
  const rows: [string, string][] = [
    ['Dominio', esc(String(f.host))],
    ['Plataforma', esc(PLATFORM_LABEL[String(f.platform)] ?? String(f.platform))],
    ['HTTPS', f.https ? 'sí' : 'no'],
    ['Idioma', esc(String(f.lang ?? '—'))],
    ['Palabras en portada', num(Number(f.words))],
    ['Enlaces internos', num(Number(f.internalLinks))],
    ['Imágenes', `${num(Number(f.images))} · ${num(Number(f.imagesWithoutAlt))} sin alt`],
    ['URLs en sitemap', num(Number(f.sitemapUrls))],
    ['ads.txt válido', f.adsTxt ? 'sí' : 'no'],
    ['Código de anuncios', f.adsCodeDetected ? `sí${f.pubId ? ` (pub-${esc(String(f.pubId))})` : ''}` : 'no'],
    ['Nicho detectado', esc(String(f.niche))],
    ['Motor', esc(r.engine)],
  ];
  return `<section class="card"><h2>Datos medidos</h2><div class="facts">
  ${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}
  </div>
  ${r.meta.notes.length ? `<div class="notice">${r.meta.notes.map((n) => esc(n)).join('<br>')}</div>` : ''}
  ${r.meta.losUnknowns.length ? `<p class="notice">Señales sin datos (no penalizan, reducen la confianza): ${r.meta.losUnknowns.map((u) => esc(u)).join(' · ')}</p>` : ''}
  </section>`;
}

function normative(): string {
  return `<section class="card"><h2>Base normativa aplicada</h2>
  <p style="color:#93a7a1;font-size:13px;margin:0 0 12px">Cada categoría de riesgo se contrasta contra la política pública de Google correspondiente. Complimiento no equivale a aprobación: la decisión final es de Google.</p>
  <div class="table-scroll"><table><thead><tr><th>Categoría</th><th>Política de Google</th></tr></thead><tbody>
  ${POLICY_CATEGORIES.map((p) => `<tr><td>${esc(p.label)}</td><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.policy)}</a></td></tr>`).join('')}
  <tr><td>Contenido de bajo valor</td><td><a href="https://support.google.com/adsense/answer/10502938" target="_blank" rel="noopener">Google Publisher Policies</a></td></tr>
  <tr><td>Requisitos del programa</td><td><a href="https://support.google.com/adsense/answer/48182" target="_blank" rel="noopener">AdSense Program policies</a></td></tr>
  </tbody></table></div>
  <p class="notice">Herramienta independiente, sin afiliación con Google. No lee tu cuenta de AdSense, ni historial de sanciones, ni datos de tráfico reales: evalúa lo que es público y verificable.</p>
  </section>`;
}

export function renderReport(r: AuditReport): string {
  return `${hero(r)}
  ${plan(r)}
  ${money(r)}
  ${signals(r)}
  ${facts(r)}
  ${normative()}`;
}
