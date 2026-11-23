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
