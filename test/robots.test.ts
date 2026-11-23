import { describe, expect, it } from 'vitest';
import { parseRobots, isAllowed, groupFor } from '../src/core/robots.ts';

const ROBOTS_BASIC = `
User-agent: *
Disallow: /admin/
Allow: /admin/publico/

User-agent: Mediapartners-Google
Disallow: /

Sitemap: https://miweb.com/sitemap.xml
`;

describe('parseRobots', () => {
  it('separa grupos y sitemaps', () => {
    const r = parseRobots(ROBOTS_BASIC);
    expect(r.groups).toHaveLength(2);
    expect(r.sitemaps).toEqual(['https://miweb.com/sitemap.xml']);
  });

  it('ignora comentarios y lineas vacias', () => {
    const r = parseRobots('# comentario\n\nUser-agent: *\nDisallow: /x  # inline');
    expect(r.groups[0].rules[0].path).toBe('/x');
  });

  it('trata "Disallow:" vacio como permitir todo', () => {
    const r = parseRobots('User-agent: *\nDisallow:');
    expect(isAllowed(r, 'Googlebot', '/cualquier-cosa')).toBe(true);
  });
});

describe('isAllowed', () => {
  it('respeta el grupo mas especifico', () => {
    const r = parseRobots(ROBOTS_BASIC);
    expect(isAllowed(r, 'Mediapartners-Google', '/')).toBe(false);
    expect(isAllowed(r, 'Googlebot', '/blog/nota')).toBe(true);
    expect(isAllowed(r, 'Googlebot', '/admin/panel')).toBe(false);
  });

  it('Allow gana a Disallow mas corto', () => {
    const r = parseRobots('User-agent: *\nDisallow: /admin/\nAllow: /admin/publico/');
    expect(isAllowed(r, 'AdsBot-Google', '/admin/publico/guia')).toBe(true);
    expect(isAllowed(r, 'AdsBot-Google', '/admin/privado')).toBe(false);
  });

  it('soporta comodines y ancla final', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*');
    expect(isAllowed(r, 'X', '/docs/guia.pdf')).toBe(false);
    expect(isAllowed(r, 'X', '/docs/guia.pdf.html')).toBe(true);
    expect(isAllowed(r, 'X', '/tmpbasura/1')).toBe(false);
  });

  it('sin reglas, permite', () => {
    expect(isAllowed(parseRobots(''), 'X', '/')).toBe(true);
    expect(groupFor(parseRobots(''), 'X')).toBeNull();
  });

  it('el grupo comodin aplica a cualquier UA', () => {
    const r = parseRobots('User-agent: *\nDisallow: /privado');
    expect(isAllowed(r, 'Mediapartners-Google', '/privado/x')).toBe(false);
  });
});
