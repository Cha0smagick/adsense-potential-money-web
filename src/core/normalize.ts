import type { NormalizedUrl, Platform } from './types.ts';

const TWO_LEVEL_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.za',
  'com.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.cl', 'com.ve', 'com.ec', 'com.uy',
  'com.es', 'com.fr', 'com.de', 'com.it', 'com.pt', 'co.jp', 'or.jp', 'ne.jp', 'co.kr',
  'com.cn', 'com.tr', 'com.ru', 'co.in', 'co.id', 'com.sg', 'com.my', 'com.ph', 'com.eg',
  'com.sa', 'com.ae', 'com.ua', 'com.pl', 'com.gr', 'com.hk', 'com.tw',
]);

/** Hosts compartidos: el dominio raiz no es del usuario. */
const SHARED_HOSTS: [RegExp, Platform][] = [
  [/\.blogspot\.[a-z.]+$/i, 'blogspot'],
  [/\.wordpress\.com$/i, 'wordpress.com'],
  [/\.github\.io$/i, 'github-pages'],
  [/\.gitlab\.io$/i, 'gitlab-pages'],
  [/\.netlify\.app$/i, 'netlify'],
  [/\.vercel\.app$/i, 'vercel'],
  [/\.pages\.dev$/i, 'cloudflare-pages'],
  [/\.web\.app$/i, 'firebase'],
  [/\.wixsite\.com$/i, 'wix'],
  [/\.weebly\.com$/i, 'weebly'],
  [/\.tumblr\.com$/i, 'tumblr'],
  [/\.substack\.com$/i, 'substack'],
  [/\.medium\.com$/i, 'medium'],
  [/\.neocities\.org$/i, 'neocities'],
];

/** Hosts donde cada repositorio/carpeta es un sitio distinto (`user.github.io/repo/`). */
const PROJECT_HOSTS = new Set<Platform>([
  'github-pages', 'gitlab-pages', 'netlify', 'vercel', 'cloudflare-pages', 'firebase',
]);

function tidySegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function normalizeUrl(raw: string): NormalizedUrl {
  const input = String(raw ?? '').trim();
  if (!input) throw new Error('Escribe una URL.');

  let candidate = input;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    // Acepta "midominio.com" pero rechaza texto suelto sin punto.
    if (!/^[^\s/]+\.[a-z]{2,}([/:?#]|$)/i.test(candidate)) throw new Error(`"${input}" no parece una URL.`);
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`URL no válida: ${input}`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Solo se admiten URLs http y https.');
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) {
    if (!/^xn--/i.test(url.hostname) && !url.hostname.includes('.')) throw new Error(`Dominio no válido: ${url.hostname}`);
  }

  url.hash = '';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const parts = host.split('.');
  const lastTwo = parts.slice(-2).join('.');
  const tld = TWO_LEVEL_TLDS.has(lastTwo) ? lastTwo : parts[parts.length - 1];

  let platform: Platform = 'unknown';
  for (const [re, p] of SHARED_HOSTS) if (re.test(host)) platform = p;

  const ownership = platform === 'unknown' ? 'owned' : 'platform';
  const origin = `${url.protocol}//${url.host}`;
  const pathname = url.pathname || '/';

  // Project page: el sitio vive en la primera carpeta (`user.github.io/repo/`).
  let basePath = '/';
  if (PROJECT_HOSTS.has(platform)) {
    const first = pathname.split('/').filter(Boolean)[0];
    if (first) basePath = `/${tidySegment(first)}/`;
  }

  // El dominio raiz no es del usuario en hosts compartidos: el "registrable" es el host.
  const registrable = ownership === 'platform'
    ? host
    : parts.slice(-(tld.split('.').length + 1)).join('.');

  const siteRoot = `${origin}${basePath}`;
  const subject = `${host}${basePath === '/' ? '' : basePath.replace(/\/$/, '')}`;
  const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const href = url.toString();
  return {
    input,
    url: `${url.protocol}//${url.host}${pathname}${url.search}`,
    href,
    host,
    tld,
    path: pathname,
    https: url.protocol === 'https:',
    registrable,
    platform,
    ownership,
    siteRoot,
    basePath,
    subject,
    slug,
  };
}

/** Firmas de HTML que identifican la plataforma cuando el dominio no la delata. */
export function detectPlatformFromHtml(html: string, current: Platform): Platform {
  if (current !== 'unknown') return current;
  const h = html.slice(0, 60000).toLowerCase();
  if (h.includes('wp-content') || h.includes('wp-includes')) return 'unknown'; // WordPress autohospedado: no es plataforma cerrada
  if (h.includes('wix.com') || h.includes('wixstatic')) return 'wix';
  if (h.includes('cdn.shopify.com') || h.includes('shopify')) return 'shopify';
  if (h.includes('ghost.org') || h.includes('ghost-url')) return 'ghost';
  if (h.includes('webflow')) return 'webflow';
  if (h.includes('squarespace')) return 'squarespace';
  if (h.includes('joomla')) return 'joomla';
  if (h.includes('drupal')) return 'drupal';
  if (h.includes('prestashop')) return 'prestashop';
  if (h.includes('magento')) return 'magento';
  if (h.includes('netlify')) return 'netlify';
  if (h.includes('vercel')) return 'vercel';
  if (h.includes('pages.dev') || h.includes('cloudflare')) return 'cloudflare-pages';
  return 'unknown';
}

export function sameSite(a: NormalizedUrl, href: string): boolean {
  try {
    const target = href.startsWith('http') ? new URL(href) : new URL(href, a.siteRoot);
    const bare = target.hostname.toLowerCase().replace(/^www\./, '');
    if (bare !== a.host.replace(/^www\./, '')) return false;
    // En project pages, un enlace a otra carpeta del mismo host es otro sitio.
    if (a.basePath !== '/' && !target.pathname.startsWith(a.basePath)) return false;
    return true;
  } catch {
    return false;
  }
}

/** ¿Es un enlace interno del sitio auditado, contando la subruta de los project pages? */
export function isInternalUrl(pageUrl: string, target: string): boolean {
  try {
    const base = new URL(pageUrl);
    const abs = new URL(target, base);
    if (abs.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return false;
    const shared = SHARED_HOSTS.some(([re]) => re.test(base.hostname));
    if (!shared) return true;
    const first = base.pathname.split('/').filter(Boolean)[0];
    if (!first) return true;
    return abs.pathname === `/${first}` || abs.pathname.startsWith(`/${first}/`);
  } catch {
    return false;
  }
}

export function absolute(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

const UTILITY_PATH = /(?:^|\/)(?:privacidad|privacy|politica-de-privacidad|aviso-legal|terminos|terms|condiciones|contacto|contact|sobre|about|quienes-somos|quien-soy|cookies|legal)(?:[/.-]|$)/i;

/** Páginas legales o de utilidad: no cuentan como contenido editorial ni como thin content. */
export function isUtilityUrl(url: string): boolean {
  try {
    return UTILITY_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

const STOPWORDS: Record<string, string[]> = {
  es: ['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto', 'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar', 'estas', 'algunas', 'algo', 'nosotros'],
  en: ['the', 'of', 'and', 'to', 'a', 'in', 'is', 'it', 'that', 'for', 'on', 'with', 'as', 'was', 'at', 'by', 'an', 'be', 'this', 'from', 'or', 'are', 'not', 'but', 'they', 'you', 'have', 'has', 'we', 'can', 'will', 'your', 'our', 'their', 'which', 'when', 'what', 'how', 'all', 'more', 'than', 'about', 'into', 'also', 'would', 'there', 'who', 'been', 'its', 'if', 'so', 'no', 'up', 'out', 'do'],
  pt: ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'estão', 'você', 'tinha', 'foram', 'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos', 'elas', 'havia', 'seja', 'qual', 'será', 'nós', 'tenho', 'lhe', 'deles', 'essas', 'esses', 'pelas', 'este', 'fosse', 'dele'],
  fr: ['le', 'de', 'un', 'à', 'être', 'et', 'en', 'avoir', 'que', 'pour', 'dans', 'ce', 'il', 'qui', 'ne', 'sur', 'se', 'pas', 'plus', 'pouvoir', 'par', 'je', 'avec', 'tout', 'faire', 'son', 'mettre', 'autre', 'on', 'mais', 'nous', 'comme', 'aller', 'vouloir', 'leur', 'arriver', 'les', 'des', 'du', 'la', 'est'],
  de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über', 'einen', 'so', 'zum', 'war', 'haben', 'nur', 'oder', 'aber', 'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein', 'wurde'],
  it: ['di', 'che', 'e', 'la', 'il', 'un', 'a', 'per', 'in', 'non', 'una', 'è', 'da', 'con', 'si', 'su', 'le', 'del', 'come', 'più', 'anche', 'lo', 'ma', 'questo', 'ha', 'sono', 'gli', 'ne', 'se', 'alla', 'nel', 'dei', 'delle', 'dal', 'al', 'essere', 'stato', 'molto', 'quando', 'fare', 'dopo'],
};

/** Idioma por densidad de stopwords. Devuelve codigo ISO-639-1 o '' si no hay evidencia. */
export function detectLanguage(text: string): { lang: string; confidence: number } {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 1);
  if (words.length < 40) return { lang: '', confidence: 0 };
  const sample = words.slice(0, 4000);
  let best = { lang: '', hits: 0 };
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    let hits = 0;
    for (const w of sample) if (set.has(w)) hits++;
    if (hits > best.hits) best = { lang, hits };
  }
  const ratio = best.hits / sample.length;
  return { lang: best.lang, confidence: Math.min(1, ratio * 6) };
}

/** Idiomas con demanda publicitaria en AdSense (soporte oficial amplio). */
export const ADSENSE_LANGS = new Set([
  'es', 'en', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'ru', 'tr', 'ar', 'he', 'hi', 'bn', 'ta',
  'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'id', 'ms', 'th', 'vi', 'ja', 'ko', 'zh', 'sv',
  'no', 'da', 'fi', 'el', 'cs', 'sk', 'hu', 'ro', 'bg', 'uk', 'hr', 'sr', 'sl', 'lt', 'lv', 'et',
]);
