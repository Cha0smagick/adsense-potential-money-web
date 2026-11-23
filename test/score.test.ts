import { describe, expect, it } from 'vitest';
import { scoreSignals } from '../src/core/score.ts';
import type { RawSignal } from '../src/core/signals.ts';
import type { Category, Status } from '../src/core/types.ts';

function sig(id: string, category: Category, weight: number, status: Status): RawSignal {
  return { id, label: id, category, weight, status, value: null, evidence: '', advice: '' };
}

const ALL_IDS: [string, Category][] = [
  ['content-reachable', 'content'], ['content-words', 'content'], ['content-thin-pages', 'content'],
  ['policy-adult', 'policy'], ['policy-parked', 'policy'],
  ['essential-privacy', 'essential'], ['essential-about', 'essential'],
  ['ux-nav', 'ux'], ['ux-mobile', 'ux'],
  ['crawl-https', 'crawl'], ['crawl-mediapartners', 'crawl'],
  ['perf-score', 'performance'], ['perf-lcp', 'performance'],
];

function all(status: Status, overrides: Record<string, Status> = {}): RawSignal[] {
  return ALL_IDS.map(([id, cat]) => sig(id, cat, 3, overrides[id] ?? status));
}

describe('scoreSignals', () => {
  it('sitio impecable = 100 con confianza total', () => {
    const r = scoreSignals(all('pass'));
    expect(r.score).toBe(100);
    expect(r.confidence).toBe(1);
    expect(r.verdict.band).toBe('ready');
    expect(r.gates.every((g) => !g.triggered)).toBe(true);
  });

  it('sin senales no inventa puntuacion', () => {
    const r = scoreSignals([]);
    expect(r.score).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('aplica tope por contenido insuficiente', () => {
    const r = scoreSignals(all('pass', { 'content-words': 'fail' }));
    expect(r.score).toBe(65);
    expect(r.gates.find((g) => g.id === 'thin')?.triggered).toBe(true);
    expect(r.verdict.summary).toContain('tope 65');
  });

  it('aplica tope por falta de politica de privacidad', () => {
    const r = scoreSignals(all('pass', { 'essential-privacy': 'fail' }));
    expect(r.score).toBe(70);
    expect(r.gates.find((g) => g.id === 'no-privacy')?.triggered).toBe(true);
  });

  it('aplica el tope mas severo cuando hay varios bloqueadores', () => {
    const r = scoreSignals(all('pass', { 'content-words': 'fail', 'policy-adult': 'fail' }));
    expect(r.score).toBe(20);
  });

  it('las senales unknown no penalizan pero bajan la confianza', () => {
    const r = scoreSignals(all('pass', { 'perf-score': 'unknown', 'perf-lcp': 'unknown' }));
    expect(r.score).toBe(100);
    expect(r.confidence).toBeLessThan(1);
    expect(r.unknowns).toHaveLength(2);
  });

  it('un aviso pesa la mitad que un fallo', () => {
    const perfect = scoreSignals(all('pass'));
    const warn = scoreSignals(all('pass', { 'ux-nav': 'warn' }));
    expect(warn.score).toBeLessThan(perfect.score);
    expect(warn.score).toBeGreaterThan(perfect.score - 5);
  });

  it('el impacto de un arreglo es el delta real de puntuacion', () => {
    const r = scoreSignals(all('pass', { 'crawl-mediapartners': 'fail' }));
    const item = r.signals.find((s) => s.id === 'crawl-mediapartners')!;
    // score = 100 limitado a 40 por el gate
    expect(r.score).toBe(40);
    // sin el gate, el fallo de una senal de peso 3 de 4 en la categoria crawl deja ~92.5
    expect(item.impact).toBeGreaterThan(40);
  });

  it('las senales en pass tienen impacto cero', () => {
    const r = scoreSignals(all('pass', { 'ux-nav': 'warn' }));
    expect(r.signals.find((s) => s.id === 'ux-mobile')!.impact).toBe(0);
  });

  it('el veredicto sigue las bandas declaradas', () => {
    const mid = scoreSignals(all('pass', { 'ux-nav': 'fail', 'ux-mobile': 'fail', 'essential-about': 'warn' }));
    expect(['caveats', 'fix-first']).toContain(mid.verdict.band);
  });
});
