import type { StatsResult, StatsTest } from './types.ts';
import { describe, histogram } from './stats.ts';
import { bootstrapCI, holm, jarqueBera, kruskalWallis, mannWhitney, spearman } from './inference.ts';

// Analisis estadistico de la muestra crawleada. La poblacion es el sitemap; la muestra
// es aleatoria con semilla. Se describe la muestra, no el trafico ni la calidad editorial.

export interface AnalysisInput {
  home: { words: number; latencyMs?: number } | null;
  pages: { url: string; words: number; latencyMs?: number }[];
  population: number;
  seed: number;
}

function depthOf(url: string): number {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length;
  } catch {
    return 1;
  }
}

export function analyze(input: AnalysisInput): StatsResult | null {
  const pages = input.pages.filter((p) => Number.isFinite(p.words));
  const words = [...pages.map((p) => p.words), ...(input.home ? [input.home.words] : [])];
  if (words.length < 4) return null;

  const tests: StatsTest[] = [];
  const homeWords = input.home?.words ?? null;

  if (homeWords !== null && pages.length >= 3) {
    const r = mannWhitney([homeWords], pages.map((p) => p.words));
    tests.push({
      id: 'home-vs-internal',
      label: 'Portada frente a páginas internas (palabras)',
      n: 1 + pages.length,
      statistic: r.u,
      p: r.p,
      effect: r.delta,
      effectLabel: 'delta de Cliff',
      decision: r.p === null ? 'sin datos suficientes' : r.p < 0.05 ? 'diferencia significativa (α = 0,05)' : 'sin evidencia suficiente',
      reliable: r.reliable,
    });
  }

  const withLatency = pages.filter((p) => typeof p.latencyMs === 'number' && p.latencyMs > 0);
  if (withLatency.length >= 8) {
    const r = spearman(withLatency.map((p) => p.words), withLatency.map((p) => p.latencyMs as number), 2000, input.seed);
    tests.push({
      id: 'words-vs-latency',
      label: 'Palabras frente a tiempo de respuesta',
      n: r.n,
      statistic: r.rho,
      p: r.p,
      effect: r.rho,
      effectLabel: 'rho de Spearman',
      decision: r.p === null ? 'sin datos suficientes' : r.p < 0.05 ? 'asociación significativa (α = 0,05)' : 'sin evidencia suficiente',
      reliable: r.reliable,
    });
  }

  const byDepth = new Map<number, number[]>();
  for (const page of pages) {
    const d = Math.min(4, depthOf(page.url));
    const list = byDepth.get(d) ?? [];
    list.push(page.words);
    byDepth.set(d, list);
  }
  const groups = Array.from(byDepth.values()).filter((g) => g.length >= 3);
  if (groups.length >= 3) {
    const r = kruskalWallis(groups);
    tests.push({
      id: 'depth-kruskal',
      label: 'Palabras por profundidad de URL',
      n: groups.reduce((a, g) => a + g.length, 0),
      statistic: r.h,
      p: r.p,
      effect: null,
      effectLabel: 'H de Kruskal-Wallis',
      decision: r.p === null ? 'sin datos suficientes' : r.p < 0.05 ? 'diferencia significativa (α = 0,05)' : 'sin evidencia suficiente',
      reliable: r.reliable,
    });
  }

  const jb = jarqueBera(words);
  if (jb.p !== null) {
    tests.push({
      id: 'normality-words',
      label: 'Normalidad de las palabras (Jarque-Bera)',
      n: jb.n,
      statistic: jb.jb,
      p: jb.p,
      effect: null,
      effectLabel: 'JB',
      decision: jb.p < 0.05 ? 'no normal: usa pruebas no paramétricas' : 'compatible con normalidad',
      reliable: jb.reliable,
    });
  }

  const adjusted = holm(tests.map((t) => t.p));
  tests.forEach((t, i) => {
    t.p = adjusted[i] ?? t.p;
  });

  const ci = bootstrapCI(words, 'mean', 2000, input.seed);

  return {
    n: words.length,
    population: input.population,
    seed: input.seed,
    variables: {
      palabras: describe(words)!,
      ...(withLatency.length ? { latenciaMs: describe(withLatency.map((p) => p.latencyMs as number))! } : {}),
    },
    tests,
    histogram: { variable: 'palabras', bins: histogram(words) },
    notes: [
      `Muestra aleatoria de ${words.length} URLs sobre ${input.population || 'población desconocida'} (semilla ${input.seed}).`,
      ci ? `IC95 bootstrap de la media de palabras: ${ci.low}–${ci.high}.` : 'Sin muestra suficiente para intervalo de confianza.',
      'Describe el sitemap, no el tráfico. Con muestras pequeñas solo se detectan efectos grandes; no prueba causalidad.',
      'p-valores ajustados con Holm cuando hay más de una prueba.',
    ],
  };
}
