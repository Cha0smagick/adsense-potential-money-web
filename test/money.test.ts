import { describe, expect, it } from 'vitest';
import { computeEconomics, sessionsPerPage } from '../src/core/economics.ts';
import { attributeLoss } from '../src/core/attribution.ts';
import { computeApproval, canMonetizeWithAdsense } from '../src/core/approval.ts';
import type { GateResult, SignalResult } from '../src/core/types.ts';

const rpm = { low: 3, base: 6, high: 9 };

function economics(overrides: Partial<Parameters<typeof computeEconomics>[0]> = {}) {
  return computeEconomics({
    sessions: 10_000,
    pagesPerVisit: 2,
    rpm,
    contentPages: 20,
    avgWords: 600,
    currentRpm: null,
    canMonetize: true,
    ...overrides,
  });
}

describe('economics', () => {
  it('calcula esperado, techo y brecha a mano', () => {
    const e = economics();
    // 10.000 sesiones × 2 páginas × 6 USD / 1000 = 120
    expect(e.expectedMonthly).toBe(120);
    // capacidad 20 × 300 = 6.000, pero las sesiones actuales (10.000) mandan en el techo
    expect(e.capacitySessions).toBe(6_000);
    // techo: max(10.000, 6.000) × 2 × 9 / 1000 = 180
    expect(e.grossMonthly).toBe(180);
    expect(e.currentMonthly).toBe(0);
    expect(e.gapMonthly).toBe(120);
    expect(e.gapRatio).toBe(1);
  });

  it('usa el RPM real cuando existe y reduce la brecha', () => {
    const e = economics({ currentRpm: 4 });
    expect(e.currentMonthly).toBe(80);
    expect(e.gapMonthly).toBe(40);
    expect(e.gapRatio).toBeCloseTo(0.333, 3);
  });

  it('sin monetizacion el ingreso actual es cero', () => {
    const e = economics({ currentRpm: 10, canMonetize: false });
    expect(e.currentMonthly).toBe(0);
    expect(e.gapMonthly).toBe(e.expectedMonthly);
  });

  it('la capacidad por pagina depende de la profundidad', () => {
    expect(sessionsPerPage(null)).toBe(300);
    expect(sessionsPerPage(200)).toBe(120);
    expect(sessionsPerPage(600)).toBe(300);
    expect(sessionsPerPage(1200)).toBe(500);
  });
});

function signal(id: string, status: SignalResult['status']): SignalResult {
  return { id, label: id, category: 'content', weight: 1, status, value: null, evidence: '', advice: '', impact: 0 };
}

function gate(id: string, cap: number, triggered = true): GateResult {
  return { id, label: id, cap, why: 'motivo', triggered };
}

describe('attribution', () => {
  const base = economics();

  it('un bloqueador subsume el resto y se lleva el 100%', () => {
    const a = attributeLoss({
      signals: [signal('content-words', 'fail'), signal('crawl-noindex', 'fail')],
      gates: [gate('thin', 65)],
      economics: base,
      pageQuality: 1,
      mobileShare: 0.6,
      canMonetize: true,
    });
    expect(a.gateId).toBe('thin');
    expect(a.subsumedByGate).toBe(true);
    expect(a.totals.all).toBe(base.expectedMonthly);
    expect(a.items).toHaveLength(1);
  });

  it('sin gate suma perdidas por mecanismo y acota al esperado', () => {
    const a = attributeLoss({
      signals: [signal('crawl-noindex', 'fail'), signal('perf-score', 'fail'), signal('content-thin-pages', 'fail')],
      gates: [],
      economics: base,
      pageQuality: 0.8,
      mobileShare: 0.6,
      canMonetize: true,
    });
    expect(a.subsumedByGate).toBe(false);
    expect(a.totals.certain).toBe(120); // noindex = 100%
    expect(a.totals.measured).toBe(24); // (1-0.8) × 120
    expect(a.totals.expected).toBeGreaterThan(0);
    expect(a.totals.all).toBeLessThanOrEqual(base.expectedMonthly);
  });

  it('un defecto sin mecanismo no se convierte en dinero', () => {
    const a = attributeLoss({
      signals: [signal('crawl-canonical', 'fail')],
      gates: [],
      economics: base,
      pageQuality: 1,
      mobileShare: 0.6,
      canMonetize: true,
    });
    expect(a.items).toHaveLength(0);
    expect(a.totals.all).toBe(0);
    expect(a.narrative[0]).toContain('Sin pérdidas cuantificables');
  });

  it('el subdominio de plataforma es perdida cierta si no se puede monetizar', () => {
    const a = attributeLoss({
      signals: [signal('monetization-domain', 'warn')],
      gates: [],
      economics: base,
      pageQuality: 1,
      mobileShare: 0.6,
      canMonetize: false,
    });
    expect(a.items[0].mechanism).toBe('binary');
    expect(a.totals.certain).toBe(base.expectedMonthly);
  });
});

function approval(overrides: Partial<Parameters<typeof computeApproval>[0]> = {}) {
  return computeApproval({
    score: 90,
    confidence: 0.9,
    gates: [],
    signals: [],
    ownership: 'owned',
    platform: 'unknown',
    contentPages: 30,
    domainAgeYears: 3,
    adsCode: true,
    expectedMonthly: 120,
    fixHours: 4,
    ...overrides,
  });
}

describe('approval', () => {
  it('devuelve probabilidad en rango y tiempos ordenados', () => {
    const a = approval();
    expect(a.probability.low).toBeLessThanOrEqual(a.probability.base);
    expect(a.probability.base).toBeLessThanOrEqual(a.probability.high);
    expect(a.probability.base).toBeGreaterThan(0.5);
    expect(a.days.p50).toBeLessThan(a.days.p80);
    expect(a.days.p80).toBeLessThan(a.days.p90);
  });

  it('un bloqueador baja la probabilidad y alarga el tiempo', () => {
    const clean = approval();
    const gated = approval({ gates: [gate('mediapartners', 40)], signals: [signal('crawl-mediapartners', 'fail')] });
    expect(gated.probability.base).toBeLessThan(clean.probability.base);
    expect(gated.days.p50).toBeGreaterThan(clean.days.p50);
    expect(gated.readiness).toBeLessThan(clean.readiness);
  });

  it('sin dominio verificable la probabilidad se capa', () => {
    const a = approval({ ownership: 'platform', platform: 'github-pages' });
    expect(canMonetizeWithAdsense('platform', 'github-pages')).toBe(false);
    expect(a.probability.base).toBeLessThanOrEqual(0.12);
    expect(a.recommendation).toBe('prepare-first');
  });

  it('blogger si se puede monetizar', () => {
    expect(canMonetizeWithAdsense('platform', 'blogspot')).toBe(true);
  });

  it('con rechazo probable recomienda preparar primero', () => {
    const a = approval({ score: 60, confidence: 0.8, fixHours: 2 });
    expect(a.recommendation).toBe('prepare-first');
  });

  it('con sitio listo y arreglo barato recomienda aplicar ya', () => {
    const a = approval({ score: 100, confidence: 1, fixHours: 0.2 });
    expect(a.recommendation).toBe('apply-now');
  });

  it('declara la calibración pública como no validada y ensancha el rango', () => {
    const a = approval();
    expect(a.validation.status).toBe('failed');
    expect(a.validation.auc).toBeLessThan(0.6);
    expect(a.probability.high - a.probability.low).toBeGreaterThanOrEqual(0.3);
    expect(a.notes.join(' ')).toContain('AUC');
  });
});
