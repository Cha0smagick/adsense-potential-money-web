// Estadística descriptiva. Sin dependencias y con cuartiles por interpolación lineal
// (método 7 de Hyndman-Fan), que es el que usan R y NumPy por defecto.

export interface Descriptive {
  n: number;
  mean: number;
  median: number;
  sd: number;
  cv: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  iqr: number;
  skewness: number;
  kurtosis: number;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return Number.NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

export function describe(values: number[]): Descriptive | null {
  const data = values.filter((v) => Number.isFinite(v));
  if (!data.length) return null;
  const sorted = data.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = quantile(sorted, 0.5);
  const variance = n > 1 ? sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const m2 = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const m3 = sorted.reduce((acc, v) => acc + (v - mean) ** 3, 0) / n;
  const m4 = sorted.reduce((acc, v) => acc + (v - mean) ** 4, 0) / n;
  const g1 = m2 > 0 ? m3 / m2 ** 1.5 : 0;
  const g2 = m2 > 0 ? m4 / m2 ** 2 - 3 : 0;
  const skewness = n > 2 ? (Math.sqrt(n * (n - 1)) / (n - 2)) * g1 : 0;
  const kurtosis = n > 3 ? ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6) : 0;
  return {
    n,
    mean: round(mean),
    median: round(median),
    sd: round(sd),
    cv: mean !== 0 ? round(sd / Math.abs(mean)) : 0,
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
    p10: round(quantile(sorted, 0.1)),
    p25: round(quantile(sorted, 0.25)),
    p75: round(quantile(sorted, 0.75)),
    p90: round(quantile(sorted, 0.9)),
    iqr: round(quantile(sorted, 0.75) - quantile(sorted, 0.25)),
    skewness: round(skewness),
    kurtosis: round(kurtosis),
  };
}

export function sturges(n: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(1, n)) + 1));
}

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export function histogram(values: number[], bins?: number): HistogramBin[] {
  const data = values.filter((v) => Number.isFinite(v));
  if (!data.length) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const k = Math.max(1, bins ?? sturges(data.length));
  if (min === max) return [{ start: min, end: max, count: data.length }];
  const width = (max - min) / k;
  const out: HistogramBin[] = Array.from({ length: k }, (_, i) => ({
    start: round(min + i * width),
    end: round(min + (i + 1) * width),
    count: 0,
  }));
  for (const v of data) {
    const idx = Math.min(k - 1, Math.floor((v - min) / width));
    out[idx].count++;
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
