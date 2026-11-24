// Inferencia no paramétrica y bootstrap. Todos los tests devuelven p-valor y tamaño
// del efecto; con muestras pequeñas se marca `reliable=false` en vez de fingir precisión.

import { describe, quantile } from './stats.ts';
import { xorshift32 } from './sample.ts';

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** p-valor de chi-cuadrado. df=1 y df=2 son exactos; el resto, Wilson-Hilferty. */
export function chiSquareP(x: number, df: number): number {
  if (!Number.isFinite(x) || x <= 0 || df <= 0) return 1;
  if (df === 1) return clamp01(2 * (1 - normalCdf(Math.sqrt(x))));
  if (df === 2) return clamp01(Math.exp(-x / 2));
  const z = (Math.cbrt(x / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return clamp01(1 - normalCdf(z));
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function ranks(values: number[]): { ranks: number[]; ties: number[] } {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  const ties: number[] = [];
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = avg;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks: out, ties };
}

export interface MannWhitneyResult {
  u: number;
  p: number | null;
  delta: number;
  n1: number;
  n2: number;
  reliable: boolean;
}

export function mannWhitney(a: number[], b: number[]): MannWhitneyResult {
  const n1 = a.length;
  const n2 = b.length;
  if (!n1 || !n2) return { u: 0, p: null, delta: 0, n1, n2, reliable: false };
  const { ranks: allRanks, ties } = ranks([...a, ...b]);
  const r1 = allRanks.slice(0, n1).reduce((acc, v) => acc + v, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const n = n1 + n2;
  const tieTerm = ties.reduce((acc, t) => acc + (t ** 3 - t), 0);
  const sd = Math.sqrt((n1 * n2 / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  const z = sd > 0 ? (u - (n1 * n2) / 2 + 0.5) / sd : 0;
  const p = sd > 0 ? round(clamp01(2 * (1 - normalCdf(Math.abs(z))))) : 1;
  const delta = round((u1 - u2) / (n1 * n2));
  return { u, p, delta, n1, n2, reliable: n1 >= 8 && n2 >= 8 };
}

export interface KruskalResult {
  h: number;
  p: number | null;
  df: number;
  reliable: boolean;
}

export function kruskalWallis(groups: number[][]): KruskalResult {
  const valid = groups.filter((g) => g.length > 0);
  const n = valid.reduce((acc, g) => acc + g.length, 0);
  const df = valid.length - 1;
  if (df < 1 || n < 3) return { h: 0, p: null, df: Math.max(0, df), reliable: false };
  const { ranks: allRanks, ties } = ranks(valid.flat());
  let offset = 0;
  let sum = 0;
  for (const g of valid) {
    const r = allRanks.slice(offset, offset + g.length).reduce((acc, v) => acc + v, 0);
    sum += (r * r) / g.length;
    offset += g.length;
  }
  let h = (12 / (n * (n + 1))) * sum - 3 * (n + 1);
  const tieTerm = ties.reduce((acc, t) => acc + (t ** 3 - t), 0);
  if (tieTerm > 0) h /= 1 - tieTerm / (n ** 3 - n);
  return { h: round(h), p: round(chiSquareP(h, df)), df, reliable: n >= 15 };
}

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

export interface SpearmanResult {
  rho: number;
  p: number | null;
  n: number;
  reliable: boolean;
}

export function spearman(x: number[], y: number[], permutations = 2000, seed = 1): SpearmanResult {
  const n = Math.min(x.length, y.length);
  if (n < 4) return { rho: 0, p: null, n, reliable: false };
  const rx = ranks(x.slice(0, n)).ranks;
  const ry = ranks(y.slice(0, n)).ranks;
  const rho = round(pearson(rx, ry));
  const rand = xorshift32(seed);
  let hits = 0;
  const shuffled = ry.slice();
  for (let b = 0; b < permutations; b++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (Math.abs(pearson(rx, shuffled)) >= Math.abs(rho)) hits++;
  }
  return { rho, p: round((hits + 1) / (permutations + 1)), n, reliable: n >= 8 };
}

export interface ChiSquareResult {
  chi2: number;
  p: number | null;
  n: number;
  reliable: boolean;
}

/** Tabla 2×2 con corrección de Yates. */
export function chiSquare2x2(a: number, b: number, c: number, d: number): ChiSquareResult {
  const n = a + b + c + d;
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const c2 = b + d;
  if (!r1 || !r2 || !c1 || !c2) return { chi2: 0, p: null, n, reliable: false };
  const chi2 = (n * (Math.abs(a * d - b * c) - n / 2) ** 2) / (r1 * r2 * c1 * c2);
  return { chi2: round(chi2), p: round(chiSquareP(chi2, 1)), n, reliable: n >= 20 };
}

export interface JarqueBeraResult {
  jb: number;
  p: number | null;
  n: number;
  reliable: boolean;
}

export function jarqueBera(values: number[]): JarqueBeraResult {
  const d = describe(values);
  if (!d || d.n < 20) return { jb: 0, p: null, n: d?.n ?? 0, reliable: false };
  const jb = (d.n / 6) * (d.skewness ** 2 + d.kurtosis ** 2 / 4);
  return { jb: round(jb), p: round(chiSquareP(jb, 2)), n: d.n, reliable: true };
}

/** Intervalo de confianza por bootstrap percentil, con semilla reproducible. */
export function bootstrapCI(
  values: number[],
  statistic: 'mean' | 'median' = 'mean',
  iterations = 2000,
  seed = 1,
  alpha = 0.05,
): { low: number; high: number; iterations: number } | null {
  const data = values.filter((v) => Number.isFinite(v));
  if (data.length < 3) return null;
  const rand = xorshift32(seed);
  const stats: number[] = [];
  const sample = new Array<number>(data.length);
  for (let b = 0; b < iterations; b++) {
    for (let i = 0; i < data.length; i++) sample[i] = data[Math.floor(rand() * data.length)];
    const sorted = sample.slice().sort((a, b2) => a - b2);
    stats.push(statistic === 'mean' ? sorted.reduce((a, v) => a + v, 0) / sorted.length : quantile(sorted, 0.5));
  }
  stats.sort((a, b) => a - b);
  return {
    low: round(quantile(stats, alpha / 2)),
    high: round(quantile(stats, 1 - alpha / 2)),
    iterations,
  };
}

/** Corrección de Holm para comparaciones múltiples. Devuelve p ajustados en el orden original. */
export function holm(pValues: (number | null)[]): (number | null)[] {
  const indexed = pValues
    .map((p, i) => ({ p, i }))
    .filter((x): x is { p: number; i: number } => x.p !== null)
    .sort((a, b) => a.p - b.p);
  const m = indexed.length;
  const adjusted = new Array<number | null>(pValues.length).fill(null);
  let running = 0;
  indexed.forEach((item, rank) => {
    running = Math.max(running, Math.min(1, item.p * (m - rank)));
    adjusted[item.i] = round(running);
  });
  return adjusted;
}
