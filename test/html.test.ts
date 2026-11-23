import { describe, expect, it } from 'vitest';
import { countWords, decodeEntities, parseHtml, toText } from '../src/core/html.ts';

const parrafo = 'La fotosíntesis es el proceso por el cual las plantas convierten la luz solar en energía química. ';

function page(opts: { words: number; extra?: string; head?: string; tags?: string } = { words: 20 }) {
  const body = Array.from({ length: opts.words }, () => parrafo).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
${opts.head ?? ''}<title>Mi web de jardinería</title>
<meta name="description" content="Guías de jardinería para principiantes">
<link rel="canonical" href="https://miweb.com/">
</head><body><h1>Jardinería en casa</h1><h2>Riego</h2><h2>Sustrato</h2>
<nav><a href="/guias">Guías</a><a href="/contacto">Contacto</a><a href="https://otro.com">Externo</a></nav>
<p>${body}</p>${opts.extra ?? ''}${opts.tags ?? ''}</body></html>`;
}

describe('decodeEntities', () => {
  it('decodifica nombradas y numericas', () => {
    expect(decodeEntities('caf&eacute; &amp; t&eacute; &#191;qu&eacute;?')).toBe('café & té ¿qué?');
    expect(decodeEntities('&#x41;&#66;')).toBe('AB');
    expect(decodeEntities('&desconocida;')).toBe('&desconocida;');
  });
});

describe('toText / countWords', () => {
  it('quita scripts y estilos del texto visible', () => {
    const html = '<div>Hola <script>var x = "texto falso"</script><style>.a{color:red}</style>mundo</div>';
    expect(toText(html)).toBe('Hola mundo');
    expect(countWords(toText(html))).toBe(2);
  });

  it('no cuenta palabras de una sola letra ni simbolos', () => {
    expect(countWords('a b c hola mundo 12 %')).toBe(3);
  });
});

describe('parseHtml', () => {
  it('extrae metadatos y estructura', () => {
    const doc = parseHtml(page({ words: 40 }), 'https://miweb.com/');
    expect(doc.lang).toBe('es');
    expect(doc.title).toBe('Mi web de jardinería');
    expect(doc.metaDescription).toContain('Guías de jardinería');
    expect(doc.canonical).toBe('https://miweb.com/');
    expect(doc.h1).toHaveLength(1);
    expect(doc.h2).toHaveLength(2);
    expect(doc.internalLinks.length).toBe(2);
    expect(doc.links.some((l) => !l.internal)).toBe(true);
    expect(doc.wordCount).toBeGreaterThan(300);
  });

  it('detecta pagina fina', () => {
    const doc = parseHtml(page({ words: 0, extra: '<p>En construcción</p>' }), 'https://miweb.com/');
    expect(doc.wordCount).toBeLessThan(30);
  });

  it('detecta codigo de anuncios y pub id sin falsos positivos', () => {
    const doc = parseHtml(
      page({ words: 5, tags: '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"></script>' }),
      'https://miweb.com/',
    );
    expect(doc.adsCode).toBe(true);
    expect(doc.pubIds).toEqual(['1234567890123456']);

    const clean = parseHtml(page({ words: 5, extra: '<p>menciono ca-pub- pero no es un id</p>' }), 'https://miweb.com/');
    expect(clean.pubIds).toEqual([]);
    expect(clean.adsCode).toBe(false);
  });

  it('lee noindex, viewport y json-ld', () => {
    const doc = parseHtml(
      page({
        words: 2,
        head: '<meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width">',
        tags: '<script type="application/ld+json">{"@type":"Article","headline":"x"}</script>',
      }),
      'https://miweb.com/',
    );
    expect(doc.robotsMeta).toContain('noindex');
    expect(doc.viewport).toBe('present');
    expect(doc.jsonLdTypes).toContain('Article');
  });

  it('no marca overlay cuando solo hay position:fixed normal', () => {
    const doc = parseHtml(page({ words: 5, tags: '<div style="position:fixed;bottom:0">aviso</div>' }), 'https://miweb.com/');
    expect(doc.overlaySignals).toBe(0);
  });
});
