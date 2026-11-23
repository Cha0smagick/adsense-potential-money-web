import type { LinkRef, PageDoc } from './types.ts';
import { absolute } from './normalize.ts';

// Extractor de HTML sin dependencias. No es un navegador: cubre solo lo que el
// auditor necesita (metadatos, texto visible, enlaces, senales de anuncios).
// shortcut: regex en vez de parser real; si aparece HTML malformado raro, migrar a linkedom.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  ordm: 'º', deg: '°', middot: '·', bull: '•', euro: '€', pound: '£', copy: '©', reg: '®',
  trade: '™', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  uuml: 'ü', Uuml: 'Ü', iexcl: '¡', iquest: '¿', ccedil: 'ç', Ccedil: 'Ç', szlig: 'ß',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', acirc: 'â', ecirc: 'ê',
  ocirc: 'ô', auml: 'ä', ouml: 'ö', Auml: 'Ä', Ouml: 'Ö', aring: 'å', oslash: 'ø', aelig: 'æ',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,7});/g, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const key = m[1].toLowerCase();
    if (key in out) continue;
    out[key] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').trim();
  }
  return out;
}

const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|aside|main|figure|figcaption|blockquote|pre|hr|form|fieldset|label|option|select|textarea|dd|dt|dl|address|details|summary)\b[^>]*>/gi;

export function stripHidden(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|svg|iframe|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
}

export function toText(html: string): string {
  return decodeEntities(stripHidden(html).replace(BLOCK_TAGS, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w) && w.length > 1).length;
}

function allText(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, 'gi');
  while ((m = g.exec(html))) out.push(m[1]);
  return out;
}

function metaMap(html: string): { names: Record<string, string>; og: Record<string, string> } {
  const names: Record<string, string> = {};
  const og: Record<string, string> = {};
  const re = /<meta\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const a = parseAttrs(m[1]);
    const content = a.content ?? '';
    if (!content) continue;
    const key = (a.name ?? a.property ?? a.itemprop ?? '').toLowerCase();
    if (!key) continue;
    if (key.startsWith('og:')) og[key] = content;
    else if (!(key in names)) names[key] = content;
  }
  return { names, og };
}

export function parseHtml(html: string, pageUrl: string): PageDoc {
  const source = String(html ?? '');
  const lower = source.toLowerCase();

  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(source);
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(source);
  const scope = bodyMatch ? bodyMatch[1] : source;

  const titleRaw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(headMatch?.[1] ?? source)?.[1] ?? '';
  const htmlTag = /<html\b([^>]*)>/i.exec(source)?.[1] ?? '';
  const lang = (parseAttrs(htmlTag).lang ?? '').slice(0, 5).toLowerCase();

  const { names, og } = metaMap(headMatch?.[1] ?? source);

  const links: LinkRef[] = [];
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(scope))) {
    const a = parseAttrs(lm[1]);
    const href = a.href ?? '';
    if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href)) continue;
    const text = toText(lm[2]).slice(0, 120);
    const abs = absolute(pageUrl, href);
    let internal = true;
    try {
      internal = new URL(abs).hostname.replace(/^www\./, '') === new URL(pageUrl).hostname.replace(/^www\./, '');
    } catch {
      internal = false;
    }
    links.push({ href: abs, text, rel: a.rel ?? '', target: a.target ?? '', internal });
  }

  const images: { src: string; alt: string }[] = [];
  const imgRe = /<img\b([^>]*)>/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(scope))) {
    const a = parseAttrs(im[1]);
    images.push({ src: (a.src ?? a['data-src'] ?? '').slice(0, 300), alt: (a.alt ?? '').slice(0, 200) });
  }

  const text = toText(scope);
  const wordCount = countWords(text);
  const paragraphs = allText(scope, /<p\b[^>]*>([\s\S]*?)<\/p>/i)
    .map((p) => toText(p))
    .filter((p) => p.length > 40);

  const scriptCount = (source.match(/<script\b/gi) ?? []).length;
  const inlineScriptBytes = (source.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []).join('').length;

  const jsonLdTypes: string[] = [];
  const ldRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(source))) {
    try {
      const parsed = JSON.parse(ld[1].trim());
      const push = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const t = (node as { '@type'?: unknown })['@type'];
        if (typeof t === 'string') jsonLdTypes.push(t);
        if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && jsonLdTypes.push(x));
      };
      if (Array.isArray(parsed)) parsed.forEach(push);
      else push(parsed);
    } catch {
      /* JSON-LD roto: no puntua ni penaliza */
    }
  }

  const viewport = names.viewport ?? '';
  const faviconLink = /<link\b([^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*)>/i.exec(headMatch?.[1] ?? source)?.[1] ?? '';

  const pubIds = Array.from(new Set(Array.from(source.matchAll(/ca-pub-(\d{10,})/gi)).map((x) => x[1])));
  const adsCode = /adsbygoogle|pagead2\.googlesyndication\.com|securepubads|doubleclick\.net|googletag/i.test(source);

  // Solo cuenta como intersticial lo que puede tapar contenido: capa fija a pantalla completa.
  const overlaySignals =
    (lower.match(/position\s*:\s*fixed/g) ?? []).length > 0 &&
    /(inset\s*:\s*0|top\s*:\s*0\s*;\s*left\s*:\s*0|width\s*:\s*100(vw|%)\s*;\s*height\s*:\s*100(vh|%))/i.test(source)
      ? (lower.match(/position\s*:\s*fixed/g) ?? []).length
      : 0;

  const emails = Array.from(new Set(Array.from(source.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)).map((x) => x[0].toLowerCase()))).slice(0, 5);

  const noindex = /noindex|none/i.test(names.robots ?? '');

  return {
    url: pageUrl,
    title: decodeEntities(titleRaw).replace(/\s+/g, ' ').trim().slice(0, 300),
    metaDescription: (names.description ?? '').slice(0, 500),
    lang,
    canonical: (/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(headMatch?.[1] ?? source)?.[0] ?? '')
      ? parseAttrs(/<link\b([^>]*rel\s*=\s*["']canonical["'][^>]*)>/i.exec(headMatch?.[1] ?? source)?.[1] ?? '').href ?? ''
      : '',
    robotsMeta: noindex ? ['noindex'] : [],
    h1: allText(scope, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i).map((t) => toText(t)).filter(Boolean),
    h2: allText(scope, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i).map((t) => toText(t)).filter(Boolean),
    h3: allText(scope, /<h3\b[^>]*>([\s\S]*?)<\/h3>/i).map((t) => toText(t)).filter(Boolean),
    paragraphs,
    text,
    wordCount,
    htmlLength: source.length,
    // El ratio se mide sobre el marcado, no sobre el HTML bruto: las plantillas con
    // mucho JS/CSS inline (Blogspot, WordPress con builders) no son "webs vacias".
    textRatio: (source.length - inlineScriptBytes) > 0 ? text.length / (source.length - inlineScriptBytes) : 0,
    links,
    internalLinks: links.filter((l) => l.internal),
    images,
    scriptCount,
    inlineScriptBytes,
    jsonLdTypes,
    og,
    viewport: viewport ? 'present' : '',
    favicon: faviconLink ? 'present' : '',
    formCount: (scope.match(/<form\b/gi) ?? []).length,
    hasAuthLink: /href\s*=\s*["'][^"']*(?:login|sign-?in|iniciar-sesion|acceder|mi-cuenta|my-account)/i.test(scope),
    adsCode,
    pubIds,
    overlaySignals,
    emails,
  };
}
