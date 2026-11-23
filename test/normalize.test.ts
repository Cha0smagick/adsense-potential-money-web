import { describe, expect, it } from 'vitest';
import { detectLanguage, normalizeUrl, sameSite, absolute } from '../src/core/normalize.ts';

describe('normalizeUrl', () => {
  it('acepta dominio sin esquema y asume https', () => {
    const n = normalizeUrl('midominio.com');
    expect(n.url).toBe('https://midominio.com/');
    expect(n.host).toBe('midominio.com');
    expect(n.tld).toBe('com');
    expect(n.https).toBe(true);
  });

  it('normaliza mayusculas, puerto y fragmento', () => {
    const n = normalizeUrl('http://WWW.Example.COM:80/Path/?q=1#seccion');
    expect(n.host).toBe('www.example.com');
    expect(n.url).not.toContain('#');
    expect(n.https).toBe(false);
    expect(n.path).toBe('/Path/');
  });

  it('reconoce TLD de dos niveles', () => {
    const n = normalizeUrl('https://tienda.midominio.co.uk/catalogo');
    expect(n.tld).toBe('co.uk');
    expect(n.registrable).toBe('midominio.co.uk');
  });

  it('detecta blogspot y wordpress.com', () => {
    expect(normalizeUrl('miblog.blogspot.com').platform).toBe('blogspot');
    expect(normalizeUrl('https://miblog.blogspot.com.es').platform).toBe('blogspot');
    expect(normalizeUrl('misitio.wordpress.com').platform).toBe('wordpress.com');
    expect(normalizeUrl('https://miweb.com').platform).toBe('unknown');
  });

  it('rechaza entradas que no son URL', () => {
    expect(() => normalizeUrl('')).toThrow();
    expect(() => normalizeUrl('hola que tal')).toThrow();
    expect(() => normalizeUrl('ftp://archivos.com')).toThrow();
  });

  it('acepta IDN', () => {
    const n = normalizeUrl('https://ñandú.com');
    expect(n.host.startsWith('xn--')).toBe(true);
  });
});

describe('sameSite / absolute', () => {
  it('trata www y no-www como el mismo sitio', () => {
    const n = normalizeUrl('https://miweb.com');
    expect(sameSite(n, 'https://www.miweb.com/blog')).toBe(true);
    expect(sameSite(n, 'https://otro.com')).toBe(false);
    expect(sameSite(n, '/relativa')).toBe(true);
  });

  it('resuelve rutas relativas', () => {
    expect(absolute('https://miweb.com/a/b', '../c')).toBe('https://miweb.com/c');
  });
});

describe('detectLanguage', () => {
  it('identifica espanol', () => {
    const text = Array(60).fill('la casa de la playa que es de mi padre en el pueblo').join(' ');
    expect(detectLanguage(text).lang).toBe('es');
  });

  it('identifica ingles', () => {
    const text = Array(60).fill('the house of the beach that is not in the city and was for you').join(' ');
    expect(detectLanguage(text).lang).toBe('en');
  });

  it('no inventa idioma con texto escaso', () => {
    expect(detectLanguage('hola mundo').lang).toBe('');
  });
});
