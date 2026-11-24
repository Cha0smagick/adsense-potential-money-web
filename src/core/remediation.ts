import type { FixLink } from './types.ts';

// Un enlace oficial por hallazgo. Regla: si no hay enlace, el informe no es accionable.
// Los tests comprueban que toda senal generada tiene entrada y que la URL es https de
// un dominio permitido. Verificadas con peticion real el 2026-11-24.

const POLICIES = 'https://support.google.com/adsense/answer/10502938';
const PROGRAM = 'https://support.google.com/adsense/answer/48182';
const CMP = 'https://support.google.com/adsense/answer/13554116';
const ADS_PLACEMENT = 'https://support.google.com/adsense/answer/1348737';
const HELPFUL = 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content';
const SPAM = 'https://developers.google.com/search/docs/essentials/spam-policies';
const ARTICLE = 'https://developers.google.com/search/docs/appearance/structured-data/article';
const DUPLICATE = 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls';
const BLOCK = 'https://developers.google.com/search/docs/crawling-indexing/block-indexing';
const SITEMAP = 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap';
const CRAWLERS = 'https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers';
const ERRORS = 'https://developers.google.com/search/docs/crawling-indexing/http-network-errors';
const JS_SEO = 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics';
const FAVICON = 'https://developers.google.com/search/docs/appearance/favicon-in-search';
const SNIPPET = 'https://developers.google.com/search/docs/appearance/snippet';
const STARTER = 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide';
const VITALS = 'https://web.dev/articles/vitals';
const HTTPS = 'https://web.dev/articles/why-https-matters';
const RWD = 'https://web.dev/articles/responsive-web-design-basics';
const LANG = 'https://www.w3.org/International/questions/qa-html-language-declarations';
const BETTER_ADS = 'https://www.betterads.org/standards/';

const link = (url: string, label: string): FixLink => ({ url, label });

const POLICY = link(POLICIES, 'Políticas para editores de Google');
const PROGRAM_LINK = link(PROGRAM, 'Políticas del programa AdSense');

export const REMEDIATION: Record<string, FixLink> = {
  // Contenido
  'content-reachable': link(ERRORS, 'Comprobar errores HTTP y de red'),
  'content-words': link(HELPFUL, 'Crear contenido útil y original'),
  'content-text-ratio': link(JS_SEO, 'Servir contenido en el HTML inicial'),
  'content-h1': link(STARTER, 'Guía de estructura y encabezados'),
  'content-structure': link(STARTER, 'Guía de estructura de página'),
  'content-keyword-stuffing': link(SPAM, 'Evitar el relleno de palabras clave'),
  'content-authoring': link(ARTICLE, 'Marcar autoría con datos estructurados'),
  'content-readability': link(HELPFUL, 'Escribir para personas'),
  'content-thin-pages': link(HELPFUL, 'Ampliar o retirar páginas finas'),
  'content-duplicates': link(DUPLICATE, 'Consolidar contenido duplicado'),

  // Políticas (todas comparten la página oficial; el detalle está en el léxico)
  'policy-adult': POLICY,
  'policy-violence': POLICY,
  'policy-weapons': POLICY,
  'policy-drugs': POLICY,
  'policy-gambling': POLICY,
  'policy-pharma': POLICY,
  'policy-dishonest': POLICY,
  'policy-misrepresentative': POLICY,
  'policy-illegal': POLICY,
  'policy-intellectual-property': POLICY,
  'policy-language': PROGRAM_LINK,
  'policy-parked': PROGRAM_LINK,
  'policy-ad-density': link(ADS_PLACEMENT, 'Políticas de emplazamiento de anuncios'),

  // Páginas esenciales
  'essential-privacy': link(CMP, 'Privacidad, cookies y consentimiento'),
  'essential-terms': PROGRAM_LINK,
  'essential-about': PROGRAM_LINK,
  'essential-contact': PROGRAM_LINK,

  // UX
  'ux-nav': link(STARTER, 'Navegación clara'),
  'ux-interstitials': link(BETTER_ADS, 'Estándares Better Ads'),
  'ux-mobile': link(RWD, 'Diseño adaptable a móvil'),
  'ux-broken-links': link(ERRORS, 'Corregir enlaces roto'),

  // Rastreo
  'crawl-https': link(HTTPS, 'Por qué HTTPS importa'),
  'crawl-mediapartners': link(CRAWLERS, 'Rastreadores de Google y robots.txt'),
  'crawl-adsbot': link(CRAWLERS, 'Rastreadores de Google y robots.txt'),
  'crawl-noindex': link(BLOCK, 'Quitar noindex'),
  'crawl-sitemap': link(SITEMAP, 'Crear un sitemap'),
  'crawl-canonical': link(DUPLICATE, 'Declarar canonical'),
  'crawl-meta-description': link(SNIPPET, 'Escribir meta descripciones'),
  'crawl-lang': link(LANG, 'Declarar el idioma del HTML'),
  'crawl-favicon': link(FAVICON, 'Añadir favicon'),

  // Rendimiento
  'perf-score': link(VITALS, 'Core Web Vitals'),
  'perf-lcp': link(VITALS, 'Mejorar el LCP'),
  'perf-cls': link(VITALS, 'Evitar saltos de diseño (CLS)'),
  'perf-tbt': link(VITALS, 'Reducir el bloqueo del hilo principal'),

  // Monetización estructural
  'monetization-domain': PROGRAM_LINK,
};

export const GATE_FIX: Record<string, FixLink> = {
  unreachable: link('https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics', 'Servir el contenido en el HTML inicial'),
  parked: link(PROGRAM, 'Requisitos de contenido del programa'),
  'severe-policy': POLICY,
  mediapartners: link(CRAWLERS, 'Permitir Mediapartners-Google'),
  thin: link(HELPFUL, 'Ampliar el contenido de la portada'),
  'no-privacy': link(CMP, 'Añadir política de privacidad y consentimiento'),
};

/** Dominios aceptados: documentación oficial o estándar. */
export const FIX_ALLOWED_DOMAINS = [
  'support.google.com',
  'developers.google.com',
  'web.dev',
  'schema.org',
  'www.w3.org',
  'www.betterads.org',
  'betterads.org',
];
