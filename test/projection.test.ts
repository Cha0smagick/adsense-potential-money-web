import { describe, expect, it } from 'vitest';
import { project } from '../src/core/projection.ts';
import { NICHES } from '../src/core/lexicon.ts';
import type { ProjectionInput } from '../src/core/types.ts';

const base: ProjectionInput = {
  sessions: 10000,
  pagesPerVisit: 1.4,
  niche: NICHES.find((n) => n.id === 'general')!,
  country: 'ES',
  mobileShare: 0.6,
  ownRpm: null,
  ownCtr: null,
  perfNorm: null,
  contentPages: null,
};

describe('project', () => {
  it('devuelve cuatro horizontes con escenarios ordenados', () => {
    const p = project(base);
    expect(p.horizons.map((h) => h.months)).toEqual([1, 6, 12, 60]);
    for (const h of p.horizons) {
      expect(h.pessimistic).toBeLessThanOrEqual(h.base);
      expect(h.base).toBeLessThanOrEqual(h.optimistic);
    }
  });

  it('crece con el tiempo y acumula mas a 60 meses que a 12', () => {
    const p = project(base);
    const [m1, , m12, m60] = p.horizons;
    expect(m12.base).toBeGreaterThan(m1.base);
    expect(m60.base).toBeGreaterThan(m12.base);
    expect(m60.cumulative).toBeGreaterThan(m12.cumulative);
    expect(p.scenarios[1].points).toHaveLength(60);
  });

  it('respeta el RPM propio del usuario sin aplicar factores', () => {
    const p = project({ ...base, ownRpm: 12 });
    expect(p.rpm.base).toBe(12);
    expect(p.rpm.low).toBe(12);
  });

  it('pais y dispositivo mueven el RPM en la direccion esperada', () => {
    const es = project(base);
    const us = project({ ...base, country: 'US' });
    expect(us.rpm.base).toBeGreaterThan(es.rpm.base);

    const desktop = project({ ...base, mobileShare: 0.1 });
    expect(desktop.rpm.base).toBeGreaterThan(es.rpm.base);
  });

  it('la inversa cuadra con el modelo directo', () => {
    const p = project(base);
    const revenue = (p.inverse.sessionsNeeded * base.pagesPerVisit * p.rpm.base) / 1000;
    expect(revenue).toBeGreaterThan(p.inverse.revenueTarget * 0.97);
    expect(revenue).toBeLessThan(p.inverse.revenueTarget * 1.03);
    expect(p.inverse.pagesNeeded).toBe(Math.ceil(p.inverse.sessionsNeeded / 400));
  });

  it('campos derivados son coherentes', () => {
    const p = project(base);
    expect(p.pageviewsMonth).toBe(Math.round(base.sessions * base.pagesPerVisit));
    expect(p.impressionsMonth).toBe(p.pageviewsMonth * 3);
    expect(p.clicksMonth).toBe(Math.round(p.impressionsMonth * p.ctr));
    expect(p.impliedCpc).toBeGreaterThan(0);
    expect(p.assumptions.length).toBeGreaterThanOrEqual(6);
  });

  it('cero sesiones no rompe el modelo', () => {
    const p = project({ ...base, sessions: 0 });
    expect(p.horizons[0].base).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.inverse.sessionsNeeded)).toBe(true);
  });
});
