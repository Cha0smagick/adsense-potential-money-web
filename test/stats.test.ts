import { describe as describeData, histogram, quantile, sturges } from '../src/core/stats.ts';
import { bootstrapCI, chiSquare2x2, chiSquareP, holm, jarqueBera, kruskalWallis, mannWhitney, normalCdf, ranks, spearman } from '../src/core/inference.ts';
import { describe, expect, it } from 'vitest';

describe('stats: descriptiva', () => {
  it('media, mediana, desviación y cuartiles a mano', () => {
    const d = describeData([1, 2, 3, 4, 5])!;
    expect(d.n).toBe(5);
    expect(d.mean).toBe(3);
    expect(d.median).toBe(3);
    expect(d.sd).toBeCloseTo(1.581, 2);
    expect(d.p25).toBe(2);
    expect(d.p75).toBe(4);
    expect(d.iqr).toBe(2);
    expect(d.min).toBe(1);
    expect(d.max).toBe(5);
  });

  it('cuantil con interpolación lineal', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('histograma de Sturges cubre todos los datos', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const bins = histogram(values);
    expect(bins).toHaveLength(sturges(100));
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(100);
  });

  it('serie constante no rompe', () => {
    const d = describeData([7, 7, 7])!;
    expect(d.sd).toBe(0);
    expect(d.skewness).toBe(0);
    expect(histogram([7, 7])).toHaveLength(1);
  });

  it('lista vacía devuelve null', () => {
    expect(describeData([])).toBeNull();
  });
});

describe('inference: no paramétrica', () => {
  it('normal CDF en puntos conocidos', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 2);
    expect(chiSquareP(3.841, 1)).toBeCloseTo(0.05, 2);
  });

  it('rangos con empates usan el rango medio', () => {
    const r = ranks([10, 20, 20, 30]);
    expect(r.ranks).toEqual([1, 2.5, 2.5, 4]);
    expect(r.ties).toEqual([2]);
  });

  it('Mann-Whitney separa grupos disjuntos', () => {
    const r = mannWhitney([1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16]);
    expect(r.u).toBe(0);
    expect(r.p).toBeLessThan(0.01);
    expect(r.delta).toBeLessThan(-0.9);
    expect(r.reliable).toBe(true);
  });

  it('Mann-Whitney con grupos iguales no inventa diferencia', () => {
    const r = mannWhitney([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(r.delta).toBe(0);
    expect(r.p).toBeGreaterThan(0.5);
    expect(r.reliable).toBe(false);
  });

  it('Kruskal-Wallis detecta separación', () => {
    const r = kruskalWallis([[1, 2, 3, 4, 5], [10, 11, 12, 13, 14], [20, 21, 22, 23, 24]]);
    expect(r.p).toBeLessThan(0.05);
  });

  it('Spearman perfecto da rho 1', () => {
    const x = Array.from({ length: 12 }, (_, i) => i + 1);
    const r = spearman(x, x, 500, 3);
    expect(r.rho).toBe(1);
    expect(r.p).toBeLessThan(0.01);
  });

  it('chi-cuadrado 2x2 con Yates', () => {
    const r = chiSquare2x2(10, 20, 20, 10);
    expect(r.chi2).toBeCloseTo(5.4, 1);
    expect(r.p).toBeLessThan(0.05);
  });

  it('Jarque-Bera exige muestra suficiente', () => {
    expect(jarqueBera([1, 2, 3]).p).toBeNull();
    expect(jarqueBera(Array.from({ length: 30 }, (_, i) => i % 7)).reliable).toBe(true);
  });

  it('bootstrap devuelve un intervalo que contiene la media', () => {
    const ci = bootstrapCI([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'mean', 500, 1)!;
    expect(ci.low).toBeLessThan(5.5);
    expect(ci.high).toBeGreaterThan(5.5);
  });

  it('Holm ajusta en el orden correcto', () => {
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]);
  });
});
