import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectLanguage } from '../src/core/normalize.ts';
import { parseHtml } from '../src/core/html.ts';
import { topTermShare } from '../src/core/signals.ts';
import { scoreSignals } from '../src/core/score.ts';
import type { RawSignal } from '../src/core/signals.ts';
import { LEGAL_HINTS, POLICY_CATEGORIES } from '../src/core/lexicon.ts';
import { sampleUrls, xorshift32, seedFrom } from '../src/core/sample.ts';
import { isPrivateAddress } from '../src/deep/ssrf.ts';

function sig(id: string, category: RawSignal['category'], weight: number, status: RawSignal['status']): RawSignal {
  return { id, label: id, category, weight, status, value: null, evidence: '', advice: '' };
}

describe('A4: confianza baja no produce un veredicto de aprobado', () => {
  it('con dos señales resueltas el veredicto es insuficiente', () => {
    const r = scoreSignals([
      sig('content-reachable', 'content', 3, 'pass'),
      sig('crawl-https', 'crawl', 3, 'pass'),
    ]);
    expect(r.score).toBe(100);
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.verdict.band).toBe('insufficient');
  });

  it('con confianza suficiente vuelve a las bandas normales', () => {
    const ids: [string, RawSignal['category']][] = [
      ['content-reachable', 'content'], ['content-words', 'content'], ['content-h1', 'content'], ['content-structure', 'content'],
      ['policy-adult', 'policy'], ['policy-violence', 'policy'], ['policy-drugs', 'policy'],
      ['essential-privacy', 'essential'], ['essential-terms', 'essential'], ['essential-about', 'essential'],
      ['ux-nav', 'ux'], ['ux-mobile', 'ux'], ['ux-interstitials', 'ux'],
      ['crawl-https', 'crawl'], ['crawl-mediapartners', 'crawl'], ['crawl-noindex', 'crawl'],
      ['perf-score', 'performance'], ['perf-lcp', 'performance'],
    ];
    const r = scoreSignals(ids.map(([id, cat]) => sig(id, cat, 3, 'pass')));
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    expect(r.verdict.band).toBe('ready');
  });
});

describe('A6: X-Robots-Tag', () => {
  it('lee noindex de la cabecera', () => {
    const html = '<html lang="es"><head><title>x</title></head><body><p>hola mundo</p></body></html>';
    const doc = parseHtml(html, 'https://miweb.com/', { 'x-robots-tag': 'noindex, nofollow' });
    expect(doc.xRobotsTag).toContain('noindex');
    expect(doc.robotsMeta).toEqual([]);
  });
});

describe('A7: la marca propia no cuenta como keyword stuffing', () => {
  it('excluye los tokens de marca del término más repetido', () => {
    const text = `${Array(40).fill('jardineria').join(' ')} ${Array.from({ length: 160 }, (_, i) => `palabra${i}`).join(' ')}`;
    const raw = topTermShare(text);
    const clean = topTermShare(text, ['jardineria']);
    expect(raw.term).toBe('jardineria');
    expect(clean.term).not.toBe('jardineria');
    expect(clean.share).toBeLessThan(raw.share);
  });
});

describe('A8: detección de italiano sin el typo "dog"', () => {
  it('detecta italiano con stopwords reales', () => {
    const text = Array(60).fill('questo è un testo di prova che non ha molto senso ma serve per la lingua').join(' ');
    expect(detectLanguage(text).lang).toBe('it');
  });
});

describe('A9: los píxeles de seguimiento no cuentan como imágenes sin alt', () => {
  it('descarta 1x1, pixel y spacer', () => {
    const html = `<html><body><p>texto</p>
      <img src="https://stats.example.com/pixel.gif" width="1" height="1">
      <img src="/img/1x1.png">
      <img src="/img/spacer.gif">
      <img src="/img/foto.jpg" alt="foto">
    </body></html>`;
    const doc = parseHtml(html, 'https://miweb.com/');
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0].alt).toBe('foto');
  });
});

describe('A15: textos limpios en el léxico', () => {
  it('no hay guiones blandos ni la errata enaltace', () => {
    const lexicon = readFileSync('src/core/lexicon.ts', 'utf8');
    expect(lexicon.includes('\u00AD')).toBe(false);
    expect(lexicon.includes('enaltace')).toBe(false);
    expect(Object.values(LEGAL_HINTS).flat().every((s) => !s.includes('\u00AD'))).toBe(true);
    expect(POLICY_CATEGORIES.length).toBe(10);
  });
});

describe('muestreo reproducible', () => {
  it('misma semilla, misma muestra; no muta la entrada', () => {
    const pool = Array.from({ length: 50 }, (_, i) => `https://miweb.com/p/${i}`);
    const copy = pool.slice();
    const a = sampleUrls(pool, 8, 7);
    const b = sampleUrls(pool, 8, 7);
    expect(a).toEqual(b);
    expect(pool).toEqual(copy);
    expect(a).toHaveLength(8);
    expect(new Set(a).size).toBe(8);
  });

  it('n mayor que la población devuelve la población', () => {
    const pool = ['a', 'b'];
    expect(sampleUrls(pool, 10, 1)).toHaveLength(2);
  });

  it('semillas distintas dan órdenes distintos con alta probabilidad', () => {
    const pool = Array.from({ length: 100 }, (_, i) => `u${i}`);
    expect(sampleUrls(pool, 10, 1)).not.toEqual(sampleUrls(pool, 10, 2));
  });

  it('el PRNG es determinista y está en [0,1)', () => {
    const r1 = xorshift32(123);
    const r2 = xorshift32(123);
    for (let i = 0; i < 10; i++) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seedFrom('miweb.com')).toBe(seedFrom('miweb.com'));
  });
});

describe('A11: clasificador de direcciones privadas', () => {
  it('bloquea rangos privados y link-local', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('deja pasar direcciones públicas', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '142.250.72.14', '2001:4860:4860::8888']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
