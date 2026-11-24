import type { ScenarioPoint } from '../core/types.ts';

const COLORS = { pessimistic: '#ef5f5f', base: '#25d0a0', optimistic: '#6ea8fe' } as const;

export function gaugeSvg(score: number, band: string): string {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100 * circ;
  const color = band === 'ready' ? '#22c07f' : band === 'caveats' ? '#f0b429' : band === 'fix-first' ? '#ff9f43' : '#ef5f5f';
  return `<svg viewBox="0 0 120 120" width="168" height="168" role="img" aria-label="Puntuación ${score} sobre 100">
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="#1d2b28" stroke-width="10"/>
  <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
    stroke-dasharray="${filled.toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 60 60)"/>
</svg>`;
}

const compact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
};

export function revenueChart(series: { id: string; label: string; points: ScenarioPoint[] }[]): string {
  const W = 720;
  const H = 230;
  const padL = 52;
  const padB = 26;
  const padT = 12;
  const padR = 12;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.revenue)));
  const step = max * 1.08;

  const x = (month: number) => padL + ((month - 1) / 59) * (W - padL - padR);
  const y = (v: number) => H - padB - (v / step) * (H - padB - padT);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const vy = y(step * f);
      return `<line x1="${padL}" x2="${W - padR}" y1="${vy.toFixed(1)}" y2="${vy.toFixed(1)}" stroke="#223330" stroke-dasharray="3 4"/>
        <text x="${padL - 8}" y="${(vy + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#7d8b87">${compact(step * f)}</text>`;
    })
    .join('');

  const xticks = [1, 12, 24, 36, 48, 60]
    .map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#7d8b87">${m}</text>`)
    .join('');

  const lines = series
    .map((s) => {
      const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.month).toFixed(1)},${y(p.revenue).toFixed(1)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${COLORS[s.id as keyof typeof COLORS] ?? '#25d0a0'}" stroke-width="2" stroke-linejoin="round"/>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Proyección de ingresos a 60 meses">
  ${grid}${xticks}${lines}
  <text x="${padL}" y="${padT - 2}" font-size="10" fill="#7d8b87">USD / mes</text>
</svg>`;
}

export function legend(): string {
  return `<div class="legend">
    <span><i style="background:${COLORS.pessimistic}"></i>Pesimista</span>
    <span><i style="background:${COLORS.base}"></i>Base</span>
    <span><i style="background:${COLORS.optimistic}"></i>Optimista</span>
  </div>`;
}

const money = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/**
 * Cascada de dinero: primer paso = situacion actual, siguientes = perdidas,
 * ultimo = potencial esperado. Los valores negativos restan.
 */
export function waterfallSvg(steps: { label: string; value: number }[]): string {
  const W = 720;
  const H = 220;
  const padL = 64;
  const padB = 62;
  const padT = 16;
  const padR = 16;
  const gap = 8;
  let cumulative = steps.length ? Math.max(0, steps[0].value) : 0;
  const points: { label: string; start: number; end: number; positive: boolean }[] = [];
  for (const step of steps) {
    if (step === steps[0]) {
      points.push({ label: step.label, start: 0, end: cumulative, positive: true });
      continue;
    }
    const end = Math.max(0, cumulative + step.value);
    points.push({ label: step.label, start: cumulative, end, positive: step.value >= 0 });
    cumulative = end;
  }
  const max = Math.max(1, ...points.map((p) => Math.max(p.start, p.end)));
  const barW = (W - padL - padR - gap * (points.length - 1)) / Math.max(1, points.length);
  const y = (v: number) => H - padB - (v / (max * 1.08)) * (H - padB - padT);

  const bars = points
    .map((p, i) => {
      const x = padL + i * (barW + gap);
      const top = y(Math.max(p.start, p.end));
      const height = Math.max(1, Math.abs(y(p.start) - y(p.end)));
      const fill = p.positive ? '#25d0a0' : '#ef5f5f';
      const label = p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label;
      return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="3" fill="${fill}" opacity="${p.positive ? 0.9 : 0.75}"/>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(H - padB + 14).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#93a7a1">${label}</text>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(top - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="#e8f1ee">${money(Math.abs(p.end - p.start))}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cascada de ingresos: actual, pérdidas y potencial">
  <line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" stroke="#223330"/>
  ${bars}
  <text x="${padL}" y="${padT}" font-size="10" fill="#7d8b87">USD / mes</text>
</svg>`;
}

export function approvalBar(p: { low: number; base: number; high: number }): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const left = Math.round(p.low * 100);
  const width = Math.max(2, Math.round((p.high - p.low) * 100));
  const mark = Math.round(p.base * 100);
  return `<div class="approval-bar" role="img" aria-label="Probabilidad estimada ${pct(p.low)} a ${pct(p.high)}, base ${pct(p.base)}">
    <span class="range" style="left:${left}%;width:${width}%"></span>
    <span class="mark" style="left:${mark}%"></span>
    <span class="scale low">0%</span><span class="scale high">100%</span>
  </div>`;
}

export function histogramSvg(bins: { start: number; end: number; count: number }[]): string {
  if (!bins.length) return '';
  const W = 720;
  const H = 180;
  const padL = 36;
  const padB = 34;
  const padT = 12;
  const padR = 12;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const barW = (W - padL - padR) / bins.length;
  const bars = bins
    .map((b, i) => {
      const h = (b.count / max) * (H - padB - padT);
      const x = padL + i * barW + 1;
      const y = H - padB - h;
      const label = bins.length <= 8 || i % 2 === 0 ? `${Math.round(b.start)}` : '';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="#25d0a0" opacity="0.75"/>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(H - padB + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="#93a7a1">${label}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histograma de la muestra">
    <line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" stroke="#223330"/>
    ${bars}
    <text x="${padL}" y="${padT}" font-size="10" fill="#7d8b87">frecuencia</text>
  </svg>`;
}


