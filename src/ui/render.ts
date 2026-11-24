import type { AuditReport, CategoryScore, SignalResult } from '../core/types.ts';
import { CATEGORY_META } from '../core/score.ts';
import { POLICY_CATEGORIES } from '../core/lexicon.ts';
import { approvalBar, gaugeSvg, histogramSvg, legend, revenueChart, waterfallSvg } from './charts.ts';

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
  blogspot: 'Blogger', 'wordpress.com': 'WordPress.com', wix: 'Wix', shopify: 'Shopify', ghost: 'Ghost',
  webflow: 'Webflow', squarespace: 'Squarespace', joomla: 'Joomla', drupal: 'Drupal', prestashop: 'PrestaShop',
  magento: 'Magento', 'github-pages': 'GitHub Pages', 'gitlab-pages': 'GitLab Pages', netlify: 'Netlify',
  vercel: 'Vercel', 'cloudflare-pages': 'Cloudflare Pages', firebase: 'Firebase', weebly: 'Weebly',
  tumblr: 'Tumblr', substack: 'Substack', medium: 'Medium', neocities: 'Neocities', unknown: 'dominio propio',
};
const MECHANISM_LABEL = { binary: 'pérdida cierta', factor: 'pérdida medida', risk: 'pérdida esperada' } as const;
const SEVERITY_LABEL = ['', 'solo ingresos', 'menor', 'moderado', 'alto', 'bloquea o suspende'] as const;

function scoreClass(score: number | null): string {
  if (score === null) return '';
  if (score < 0.5) return 'low';
  if (score < 0.75) return 'mid';
  return '';
}

function fixLink(fix: { url: string; label: string } | null | undefined, prefix = '¿Cómo lo corrijo?'): string {
  if (!fix) return '';
  return `<a class="fix" href="${esc(fix.url)}" target="_blank" rel="noopener">${esc(prefix)} <span>·</span> ${esc(fix.label)}</a>`;
}

function hero(r: AuditReport): string {
  const s = r.score;
  const cap = s.verdict.capApplied !== null ? ` · tope ${s.verdict.capApplied}` : '';
  return `<section class="card report-hero">
  <div class="report-title print-only"><h1>Auditoría AdSense — ${esc(r.target.subject)}</h1>
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
  ${moneyStrip(r)}
  ${blockers(r)}
  ${categories(r.score.categories)}
</section>`;
}

function moneyStrip(r: AuditReport): string {
  const e = r.economics;
  const a = r.approval;
  const measured = r.attribution.totals.all;
  const gapValue = e.gapLabel === 'medida' ? measured : e.expectedMonthly;
  const gapName = e.gapLabel === 'medida' ? 'Pérdida medida' : e.gapLabel === 'bloqueado' ? 'Bloqueado' : 'Potencial sin capturar';
  const gapNote = e.gapLabel === 'medida'
    ? `${pct(e.expectedMonthly > 0 ? measured / e.expectedMonthly : 0, 0)} del potencial`
    : e.gapLabel === 'bloqueado'
      ? 'sin anuncios posibles'
      : 'sin RPM propio: no se mide';
  return `<div class="money-strip">
    <div class="money-cell"><small>Potencial esperado</small><b>${usd(e.expectedMonthly)}</b><span>USD/mes</span></div>
    <div class="money-cell"><small>${gapName}</small><b class="loss">${usd(gapValue)}</b><span>${gapNote}</span></div>
    <div class="money-cell"><small>Probabilidad de aprobación</small><b>${pct(a.probability.base, 0)}</b><span>${pct(a.probability.low, 0)} – ${pct(a.probability.high, 0)}</span></div>
    <div class="money-cell"><small>Tiempo hasta cobrar</small><b>${a.days.p50} d</b><span>P80 ${a.days.p80} d · P90 ${a.days.p90} d</span></div>
  </div>
  <div class="approval-wrap">${approvalBar(a.probability)}<span class="approval-note">estimación sin calibrar · no es una tasa de Google</span></div>`;
}

function blockers(r: AuditReport): string {
  const hit = r.score.gates.filter((g) => g.triggered);
  if (!hit.length) return `<p class="notice" style="border-left-color:#22c07f">Sin bloqueadores activos. Ningún tope limita la puntuación.</p>`;
  return `<ul class="blockers">${hit
    .map((g) => `<li><b>Bloqueador: ${esc(g.label)}</b> — puntuación limitada a ${g.cap}/100<span>${esc(g.why)}</span>${fixLink(g.fix)}</li>`)
    .join('')}</ul>`;
}

function categories(cats: CategoryScore[]): string {
  const anyCap = cats.some((c) => c.score !== null && c.score < 0.35);
  return `<div class="cats">${cats
    .map((c) => {
      const value = c.score === null ? null : c.score * 100;
      return `<div class="cat ${scoreClass(c.score)}">
      <span>${esc(c.label)} <small style="color:#7d8b87">· ${c.weight} pts</small></span>
      <span class="track"><span class="fill" style="width:${value === null ? 0 : Math.round(value)}%"></span></span>
      <span class="num">${value === null ? 's/d' : Math.round(value)}</span>
    </div>`;
    })
    .join('')}</div>
  ${anyCap ? '<p class="notice">Las barras miden el mérito por categoría antes de aplicar topes; la puntuación total puede ser menor. El bloqueador que la limita aparece arriba.</p>' : ''}`;
}

function whyNotEarning(r: AuditReport): string {
  const a = r.attribution;
  if (!a.items.length && !a.totals.all) {
    return `<section class="card"><h2>Por qué no estás ganando <span class="hint">solo se cuantifica lo que tiene mecanismo</span></h2>
    <p class="notice">No hay pérdidas cuantificables con los datos actuales. Los defectos restantes están en el plan de acción como riesgo, no como dinero.</p></section>`;
  }
  const rows = a.items
    .map(
      (i) => `<tr>
      <td><b>${esc(i.label)}</b><div class="sub">${esc(i.basis)}</div></td>
      <td><span class="chip ${i.mechanism === 'binary' ? 'fail' : i.mechanism === 'factor' ? 'warn' : 'unknown'}">${MECHANISM_LABEL[i.mechanism]}</span></td>
      <td class="num">${i.mechanism === 'risk' ? `${usd(i.monthlyLoss.low)}–${usd(i.monthlyLoss.high)}` : usd(i.monthlyLoss.base)}</td>
      <td>${esc(SEVERITY_LABEL[i.severity])}</td>
      <td>${i.hours < 1 ? `${Math.round(i.hours * 60)} min` : `${i.hours} h`}</td>
      <td>${fixLink(i.fix, 'Corregir')}</td>
    </tr>`,
    )
    .join('');
  const steps = [
    { label: 'Potencial', value: r.economics.expectedMonthly },
    ...a.items.filter((i) => i.monthlyLoss.base > 0).map((i) => ({ label: i.label, value: -i.monthlyLoss.base })),
  ];
  return `<section class="card page-break"><h2>Por qué no estás ganando <span class="hint">cada cifra con su mecanismo</span></h2>
  ${r.economics.gapLabel === 'potencial' ? '<p class="notice">No aportaste tu RPM real: esto es potencial, no una pérdida medida. Añade tu RPM para convertir la brecha en una cifra medida.</p>' : ''}
  <ul class="narrative">${a.narrative.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  <div class="chart">${waterfallSvg(steps)}</div>
  <div class="table-scroll"><table><thead><tr><th>Hallazgo</th><th>Mecanismo</th><th class="num">USD/mes</th><th>Peligro</th><th>Esfuerzo</th><th>Arreglo</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${a.subsumedByGate ? '<p class="notice">Hay un bloqueador activo: el resto de pérdidas no se suma hasta resolverlo.</p>' : ''}
  <div class="totals">
    <span>Pérdida cierta <b>${usd(a.totals.certain)}</b></span>
    <span>Pérdida medida <b>${usd(a.totals.measured)}</b></span>
    <span>Pérdida esperada <b>${usd(a.totals.expected)}</b></span>
    <span>Total acotado <b>${usd(a.totals.all)}</b></span>
  </div>
  </section>`;
}

function decision(r: AuditReport): string {
  const a = r.approval;
  const money = r.economics.expectedMonthly;
  const apply = a.applyNow;
  const prep = a.prepareFirst;
  const recommend = a.recommendation === 'apply-now'
    ? `<b class="ok">Aplica ahora.</b> La esperanza de días hasta el primer dólar es menor que preparar primero.`
    : `<b class="warn">Prepara primero.</b> Aplicar ahora alarga la espera esperada por los rechazos y sus re-revisiones.`;
  return `<section class="card"><h2>¿Aplico ya o preparo? <span class="hint">decisión con esperanza matemática, no con corazonadas</span></h2>
  <p>${recommend}</p>
  <div class="decision">
    <div class="decision-card ${a.recommendation === 'apply-now' ? 'picked' : ''}">
      <small>Aplicar ya</small>
      <b>${apply.expectedDays} días</b>
      <span>hasta el primer dólar · P(rechazo) ${pct(apply.rejectionP, 0)}</span>
      <span>coste de esperar: ${usd(apply.expectedCost)}</span>
    </div>
    <div class="decision-card ${a.recommendation === 'prepare-first' ? 'picked' : ''}">
      <small>Preparar primero</small>
      <b>${prep.expectedDays} días</b>
      <span>${prep.fixDays} días de arreglo + revisión</span>
      <span>coste de esperar: ${usd(prep.expectedCost)}</span>
    </div>
  </div>
  <ul class="assumptions">
    <li>Con ${usd(money)}/mes de potencial, un día de espera cuesta ~${usd(money / 30)}.</li>
    ${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
  </ul>
  ${a.drivers.length ? `<div class="table-scroll"><table><thead><tr><th>Factor</th><th class="num">Efecto</th><th>Nota</th></tr></thead><tbody>${a.drivers.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${d.delta}</td><td>${esc(d.note)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
}

function plan(r: AuditReport): string {
  const top = r.score.signals
    .filter((s) => s.status === 'fail' || s.status === 'warn')
    .sort((a, b) => b.impact - a.impact || (a.status === 'fail' ? -1 : 1))
    .slice(0, 10);
  if (!top.length) return '';
  return `<section class="card"><h2>Plan de acción priorizado <span class="hint">ordenado por puntos que recuperas</span></h2>
  <div class="table-scroll"><table><thead><tr><th style="width:54px">Ganancia</th><th>Acción</th><th style="width:96px">Categoría</th><th>Arreglo</th></tr></thead><tbody>
  ${top
    .map((s) => `<tr><td class="num" style="color:#25d0a0">+${s.impact.toFixed(1)}</td>
      <td><b>${esc(s.label)}</b><div class="sub">${esc(s.advice)}</div></td>
      <td>${esc(CATEGORY_META.find((c) => c.id === s.category)?.label ?? s.category)}</td>
      <td>${fixLink(s.fix, 'Ver')}</td></tr>`)
    .join('')}
  </tbody></table></div></section>`;
}

function money(r: AuditReport): string {
  const m = r.monetization;
  const e = r.economics;
  return `<section class="card page-break"><h2>Potencial de ingresos <span class="hint">modelo determinista con supuestos declarados</span></h2>
  <div class="kpis">
    <div class="kpi"><small>RPM base</small><b>${usd(m.rpm.base, 2)}</b><span>rango ${usd(m.rpm.low, 2)} – ${usd(m.rpm.high, 2)}</span></div>
    <div class="kpi"><small>Esperado / mes</small><b>${usd(e.expectedMonthly)}</b><span>${num(m.pageviewsMonth)} páginas vistas</span></div>
    <div class="kpi"><small>Techo / mes</small><b>${usd(e.grossMonthly)}</b><span>RPM alto + capacidad</span></div>
    <div class="kpi"><small>Hoy / mes</small><b>${usd(e.currentMonthly)}</b><span>${e.gapRatio > 0 ? `brecha ${pct(e.gapRatio, 0)}` : 'sin brecha'}</span></div>
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
  (≈ <b>${num(m.inverse.pagesNeeded)} páginas</b> de contenido). Con tu RPM actual, esa es la meta operativa.</div>
  <ul class="assumptions">${[...m.assumptions, ...e.drivers].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
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
      ${s.status !== 'pass' ? `<div class="adv">${esc(s.advice)}</div>` : ''}
      ${s.status !== 'pass' ? fixLink(s.fix) : ''}</div></div>`,
      )
      .join('')}
    </div>`;
  }).join('')}
  </section>`;
}

function statistics(r: AuditReport): string {
  const s = r.stats;
  if (!s) return '';
  const varRows = Object.entries(s.variables)
    .map(([name, v]) => `<tr><td>${esc(name)}</td><td class="num">${v.n}</td><td class="num">${v.mean}</td><td class="num">${v.median}</td>
      <td class="num">${v.sd}</td><td class="num">${(v.cv * 100).toFixed(0)}%</td><td class="num">${v.p25}–${v.p75}</td>
      <td class="num">${v.min}–${v.max}</td><td class="num">${v.skewness}</td></tr>`)
    .join('');
  const testRows = s.tests
    .map((t) => `<tr><td>${esc(t.label)}${t.reliable ? '' : ' <span class="chip unknown">muestra pequeña</span>'}</td>
      <td class="num">${t.n}</td><td class="num">${t.statistic}</td><td class="num">${t.p === null ? '—' : t.p}</td>
      <td class="num">${t.effect === null ? '—' : t.effect} <small>${esc(t.effectLabel)}</small></td><td>${esc(t.decision)}</td></tr>`)
    .join('');
  return `<section class="card page-break"><h2>Estadística de la muestra <span class="hint">n=${s.n} de ${s.population} URLs · semilla ${s.seed}</span></h2>
  <div class="table-scroll"><table><thead><tr><th>Variable</th><th class="num">n</th><th class="num">Media</th><th class="num">Mediana</th>
    <th class="num">DE</th><th class="num">CV</th><th class="num">P25–P75</th><th class="num">Mín–Máx</th><th class="num">Asimetría</th></tr></thead>
    <tbody>${varRows}</tbody></table></div>
  ${s.histogram ? `<div class="chart">${histogramSvg(s.histogram.bins)}</div>` : ''}
  ${testRows ? `<div class="table-scroll" style="margin-top:14px"><table><thead><tr><th>Prueba</th><th class="num">n</th><th class="num">Estadístico</th><th class="num">p (Holm)</th><th class="num">Efecto</th><th>Decisión</th></tr></thead><tbody>${testRows}</tbody></table></div>` : ''}
  <ul class="assumptions">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  </section>`;
}

function publicData(r: AuditReport): string {
  const p = r.publicData;
  if (!p) return '';
  const rdap = p.rdap
    ? `<div class="facts">
        <div><small>Alta</small><b>${esc(p.rdap.registered ?? '—')}</b></div>
        <div><small>Caducidad</small><b>${esc(p.rdap.expires ?? '—')}</b></div>
        <div><small>Registrador</small><b>${esc(p.rdap.registrar ?? '—')}</b></div>
        <div><small>Edad</small><b>${p.rdap.ageYears === null ? '—' : `${p.rdap.ageYears} años`}</b></div>
        <div><small>Estado</small><b>${esc(p.rdap.status.slice(0, 2).join(', ') || '—')}</b></div>
      </div>`
    : `<p class="notice">Registro del dominio: no aplica. ${p.eligible ? 'RDAP no respondió.' : 'El dominio raíz pertenece a la plataforma.'}</p>`;
  const dns = p.dns
    ? `<div class="facts">
        <div><small>IP</small><b>${esc(p.dns.a.slice(0, 2).join(', ') || '—')}</b></div>
        <div><small>DNS</small><b>${esc(p.dns.ns.slice(0, 2).join(', ') || '—')}</b></div>
        <div><small>Correo (MX)</small><b>${esc(p.dns.mx.slice(0, 2).join(', ') || '—')}</b></div>
        <div><small>SPF</small><b>${p.dns.spf ? 'sí' : 'no'}</b></div>
        <div><small>DMARC</small><b>${p.dns.dmarc ? 'sí' : 'no'}</b></div>
        <div><small>Verificaciones</small><b>${esc(p.dns.verifications.join(', ') || 'ninguna')}</b></div>
      </div>`
    : '';
  const tranco = p.tranco
    ? `<p class="notice">Popularidad Tranco: puesto <b>${num(p.tranco.rank)}</b> de 1.000.000 (${esc(p.tranco.date ?? '—')}). Es contexto, no requisito de AdSense.</p>`
    : p.eligible
      ? '<p class="notice">Tranco no devolvió datos: dominio fuera del top 1.000.000 o servicio caído.</p>'
      : '';
  const wayback = p.wayback
    ? `<p class="notice">Archivo web: primera captura <b>${esc(p.wayback.first ?? '—')}</b> · última <b>${esc(p.wayback.last ?? '—')}</b>.</p>`
    : '';
  const sources = `<div class="table-scroll"><table><thead><tr><th>Fuente</th><th>Estado</th><th>Nota</th></tr></thead><tbody>
    ${p.sources.map((s) => `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td>${s.ok ? 'ok' : 'sin datos'}</td><td>${esc(s.note)}</td></tr>`).join('')}
  </tbody></table></div>`;
  return `<section class="card"><h2>Datos públicos del dominio <span class="hint">solo lectura, sin claves</span></h2>
    ${rdap}${dns}${tranco}${wayback}${sources}
    <ul class="assumptions">${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  </section>`;
}

function facts(r: AuditReport): string {
  const f = r.facts;
  const rows: [string, string][] = [
    ['Sitio', esc(String(f.subject ?? f.host))],
    ['Dominio', String(f.ownership) === 'owned' ? 'propio' : 'subdominio de plataforma'],
    ['Monetizable con AdSense', f.canMonetize ? 'sí' : 'no tal como está'],
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
    ['Esperado / mes', usd(Number(f.expectedMonthly))],
    ['Preparación (0-100)', num(Number(f.approvalBase))],
    ['Motor', esc(r.engine)],
  ];
  return `<section class="card"><h2>Datos medidos</h2><div class="facts">
  ${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}
  </div>
  ${r.meta.notes.length ? `<div class="notice">${r.meta.notes.map((n) => esc(n)).join('<br>')}</div>` : ''}
  ${r.meta.unknowns.length ? `<p class="notice">Señales sin datos (no penalizan, reducen la confianza): ${r.meta.unknowns.map((u) => esc(u)).join(' · ')}</p>` : ''}
  </section>`;
}

function normative(): string {
  return `<section class="card"><h2>Base normativa aplicada</h2>
  <p style="color:#93a7a1;font-size:13px;margin:0 0 12px">Cada categoría de riesgo se contrasta contra la política pública de Google correspondiente. Cumplimiento no equivale a aprobación: la decisión final es de Google.</p>
  <div class="table-scroll"><table><thead><tr><th>Categoría</th><th>Política de Google</th></tr></thead><tbody>
  ${POLICY_CATEGORIES.map((p) => `<tr><td>${esc(p.label)}</td><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.policy)}</a></td></tr>`).join('')}
  <tr><td>Contenido de bajo valor</td><td><a href="https://support.google.com/adsense/answer/10502938" target="_blank" rel="noopener">Google Publisher Policies</a></td></tr>
  <tr><td>Requisitos del programa</td><td><a href="https://support.google.com/adsense/answer/48182" target="_blank" rel="noopener">AdSense Program policies</a></td></tr>
  <tr><td>Aprobación y tiempos</td><td><a href="https://developers.google.com/adsense/platforms/transparent/approvals" target="_blank" rel="noopener">AdSense approval process</a></td></tr>
  </tbody></table></div>
  <p class="notice">Herramienta independiente, sin afiliación con Google. No lee tu cuenta de AdSense, ni historial de sanciones, ni datos de tráfico reales: evalúa lo que es público y verificable. Cada cifra monetaria y probabilística declara su supuesto; lo que no se pudo medir aparece como «sin datos».</p>
  <p class="notice">¿Quieres adquirir esta herramienta o una versión a medida? <a href="mailto:magiadelcaospractica@gmail.com">magiadelcaospractica@gmail.com</a></p>
  </section>`;
}

export function renderReport(r: AuditReport): string {
  return `${hero(r)}
  ${whyNotEarning(r)}
  ${decision(r)}
  ${plan(r)}
  ${money(r)}
  ${statistics(r)}
  ${signals(r)}
  ${publicData(r)}
  ${facts(r)}
  ${normative()}`;
}
