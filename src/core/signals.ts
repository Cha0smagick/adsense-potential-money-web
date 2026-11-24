import type { AuditContext, SignalResult, Status } from './types.ts';
import { ADSENSE_LANGS, detectLanguage } from './normalize.ts';
import { LEGAL_HINTS, NICHES, POLICY_CATEGORIES, PARKED_PATTERNS } from './lexicon.ts';
import { ADSENSE_CRAWLERS, isAllowed, parseRobots } from './robots.ts';
import { REMEDIATION } from './remediation.ts';

export type RawSignal = Omit<SignalResult, 'impact'>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function termHits(text: string, terms: string[]): string[] {
  if (!text) return [];
  const hay = ` ${norm(text)} `;
  const hits: string[] = [];
  for (const t of terms) {
    const needle = ` ${norm(t)} `;
    if (needle.trim().length > 2 && hay.includes(needle)) hits.push(t);
  }
  return hits;
}

export function topTermShare(text: string, exclude: string[] = []): { term: string; share: number } {
  const banned = new Set(exclude.map((w) => norm(w)).filter((w) => w.length > 2));
  const words = norm(text).split(' ').filter((w) => w.length > 3 && !banned.has(w));
  if (words.length < 100) return { term: '', share: 0 };
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = { term: '', n: 0 };
  for (const [term, n] of counts) if (n > best.n) best = { term, n };
  return { term: best.term, share: best.n / words.length };
}

export function avgSentenceWords(text: string): number {
  const sentences = text.split(/[.!?¡¿]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
  if (!sentences.length) return 0;
  const total = sentences.reduce((acc, s) => acc + s.split(/\s+/).length, 0);
  return total / sentences.length;
}

export function shingles(text: string, size = 5): Set<string> {
  const words = norm(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '));
  return out;
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const s of small) if (big.has(s)) inter++;
  return inter / small.size;
}

export function detectNicheId(title: string, description: string, text: string): string {
  const strong = ` ${norm(title)} ${norm(description)} `;
  const hay = ` ${norm(text)} `;
  const ranked: { id: string; score: number }[] = [];

  for (const niche of NICHES) {
    if (!niche.keywords.length) continue;
    let score = 0;
    for (const k of niche.keywords) {
      const needle = ` ${norm(k)} `;
      if (strong.includes(needle)) score += 3;
      else if (hay.includes(needle)) score += 1;
    }
    // Normaliza por tamano del diccionario para no premiar al nicho con mas terminos.
    ranked.push({ id: niche.id, score: score / Math.sqrt(niche.keywords.length) });
  }

  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 1.5) return 'general';
  const second = ranked[1];
  // Sin ventaja clara, el sitio es transversal: mejor "general" que un nicho falso.
  if (second && best.score < second.score * 1.3) return 'general';
  // Un portal que cubre tres o más verticales con fuerza no tiene nicho dominante.
  const strongVerticals = ranked.filter((r) => r.score >= best.score * 0.7).length;
  if (strongVerticals >= 3) return 'general';
  return best.id;
}

function mk(
  id: string,
  label: string,
  category: RawSignal['category'],
  weight: number,
  status: Status,
  value: string | null,
  evidence: string,
  advice: string,
): RawSignal {
  return { id, label, category, weight, status, value, evidence, advice, fix: REMEDIATION[id] ?? null };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function buildSignals(ctx: AuditContext): RawSignal[] {
  const out: RawSignal[] = [];
  const home = ctx.home;
  const text = home?.text ?? '';
  const words = home?.wordCount ?? 0;
  const body = `${home?.title ?? ''} ${home?.metaDescription ?? ''} ${text}`;
  // La marca propia no cuenta como keyword stuffing: repetir el nombre del sitio es normal.
  const brandTokens = Array.from(
    new Set(
      [ctx.normalized.host, ctx.normalized.registrable, ctx.normalized.subject]
        .flatMap((x) => norm(x).split(/[\s./-]+/))
        .filter((w) => w.length > 3),
    ),
  );

  // ---------- C1 Contenido y originalidad ----------
  const reachableStatus: Status = !home ? 'fail' : words >= 10 ? 'pass' : 'fail';
  const reachableEvidence = !home
    ? 'No se pudo obtener el HTML de la portada.'
    : words >= 10
      ? `HTML de ${home.htmlLength.toLocaleString('es')} caracteres con ${words} palabras visibles.`
      : `HTML de ${home.htmlLength.toLocaleString('es')} caracteres pero ${words} palabras visibles: el contenido llega por JavaScript o la página está vacía.`;
  out.push(
    mk(
      'content-reachable', 'La página devuelve contenido legible', 'content', 3,
      reachableStatus,
      !home ? null : `${words} palabras`,
      reachableEvidence,
      !home
        ? 'Comprueba que el dominio responde y que no bloquea a los rastreadores.'
        : words >= 10
          ? 'El contenido se sirve en el HTML inicial: es lo que Google evalúa.'
          : 'Sirve el contenido en el HTML inicial (SSR, prerender o generador estático). Si no, Google y AdSense ven una página vacía.',
    ),
    mk(
      'content-words', 'Volumen de contenido en la portada', 'content', 8,
      words >= 600 ? 'pass' : words >= 300 ? 'warn' : 'fail',
      `${words} palabras`,
      'Criterio: Google rechaza por "contenido de bajo valor" cuando no hay sustancia suficiente. 600+ palabras visibles en portada es la zona segura; por debajo de 300 el riesgo es alto.',
      'Amplía la portada con contenido propio y útil. Si la portada es un índice, enlaza a artículos largos y añade una introducción real.',
    ),
    mk(
      'content-text-ratio', 'Densidad de texto frente a código', 'content', 4,
      !home ? 'unknown' : home.textRatio >= 0.05 ? 'pass' : home.textRatio >= 0.02 ? 'warn' : 'fail',
      home ? pct(home.textRatio) : null,
      'Páginas construidas solo con scripts suelen ser webs vacías para el rastreador de AdSense.',
      'Sirve el contenido en el HTML inicial (SSR o prerender) o reduce plantillas y scripts innecesarios.',
    ),
    mk(
      'content-h1', 'Encabezado principal único', 'content', 3,
      !home ? 'unknown' : home.h1.length === 1 ? 'pass' : home.h1.length === 0 ? 'fail' : 'warn',
      home ? `${home.h1.length} H1` : null,
      'Un H1 claro indica de qué trata la página; su ausencia es señal de plantilla vacía.',
      'Deja exactamente un H1 por página con una frase descriptiva.',
    ),
    mk(
      'content-structure', 'Estructura editorial', 'content', 3,
      !home ? 'unknown' : home.h2.length >= 2 && home.paragraphs.length >= 4 ? 'pass' : home.h2.length >= 1 || home.paragraphs.length >= 2 ? 'warn' : 'fail',
      home ? `${home.h2.length} H2 · ${home.paragraphs.length} párrafos` : null,
      'Secciones y párrafos son la huella de un artículo real frente a una página de relleno.',
      'Divide el contenido en secciones con H2 y párrafos de 3-5 frases.',
    ),
    mk(
      'content-keyword-stuffing', 'Sin repetición artificial de palabras clave', 'content', 4,
      (() => {
        if (!home) return 'unknown' as Status;
        const t = topTermShare(text, brandTokens);
        return t.share > 0.07 ? 'fail' : t.share > 0.05 ? 'warn' : 'pass';
      })(),
      home ? (() => { const t = topTermShare(text, brandTokens); return t.term ? `"${t.term}" ${pct(t.share)}` : 'sin repetición anómala'; })() : null,
      'La repetición forzada entra en "contenido engañoso" y degrada la calidad percibida.',
      'Escribe con sinónimos y variantes naturales; revisa el término más repetido.',
    ),
    mk(
      'content-authoring', 'Autoría y fecha visibles', 'content', 3,
      (() => {
        if (!home) return 'unknown' as Status;
        const structural = home.jsonLdTypes.some((t) => /Article|BlogPosting|NewsArticle|Review/i.test(t));
        const dated = /\b(20\d{2}|19\d{2})\b/.test(text) && /(actualizado|publicado|updated|published|por\s+[A-ZÁÉÍÓÚ])/i.test(text);
        return structural || dated ? 'pass' : 'warn';
      })(),
      home ? `Schema: ${home.jsonLdTypes.slice(0, 3).join(', ') || 'ninguno'}` : null,
      'E-E-A-T: quién escribe y cuándo se actualizó el contenido. Google lo valora al revisar sitios.',
      'Añade autor con página de perfil y fecha de publicación/actualización. Marca el artículo con schema Article.',
    ),
    mk(
      'content-readability', 'Frases de longitud legible', 'content', 2,
      (() => {
        if (!home || words < 80) return 'unknown' as Status;
        const avg = avgSentenceWords(text);
        return avg >= 8 && avg <= 30 ? 'pass' : 'warn';
      })(),
      home && words >= 80 ? `${avgSentenceWords(text).toFixed(1)} palabras/frase` : null,
      'Frases de 8 a 30 palabras se leen bien en móvil, donde está la mayoría del tráfico.',
      'Acorta las frases largas y separa ideas en párrafos.',
    ),
    mk(
      'content-thin-pages', 'Las páginas internas no son finas', 'content', 5,
      (() => {
        const pages = ctx.extraPages.filter((p) => !p.utility);
        return pages.length === 0 ? 'unknown' : Math.min(...pages.map((p) => p.words)) < 250 ? 'fail' : 'pass';
      })(),
      (() => {
        const pages = ctx.extraPages.filter((p) => !p.utility);
        return pages.length ? `mínimo ${Math.min(...pages.map((p) => p.words))} palabras en ${pages.length} páginas de contenido` : null;
      })(),
      'Una web con muchas páginas de 50 palabras se rechaza por contenido de bajo valor aunque la portada esté bien. Las páginas legales se excluyen: son cortas por diseño.',
      'Amplía o elimina las páginas con menos de 250 palabras. La cantidad no sustituye a la profundidad.',
    ),
    mk(
      'content-duplicates', 'Sin páginas duplicadas entre sí', 'content', 5,
      (() => {
        const pages = ctx.extraPages.filter((p) => !p.utility);
        return pages.length < 2 || !home ? 'unknown' : (() => {
          const base = shingles(text);
          const max = Math.max(...pages.map((p) => overlap(base, p.shingles)));
          return max > 0.4 ? 'fail' : max > 0.25 ? 'warn' : 'pass';
        })();
      })(),
      (() => {
        const pages = ctx.extraPages.filter((p) => !p.utility);
        return pages.length >= 2 && home ? (() => { const base = shingles(text); const max = Math.max(...pages.map((p) => overlap(base, p.shingles))); return `solapamiento máximo ${pct(max)}`; })() : null;
      })(),
      'El contenido duplicado o "spinning" es una de las causas frecuentes de rechazo.',
      'Reescribe o consolida las páginas que repiten el mismo texto. Usa canonical solo para variantes legítimas.',
    ),
  );

  // ---------- C2 Cumplimiento de politicas ----------
  const policyStatus = (id: string): RawSignal => {
    const cat = POLICY_CATEGORIES.find((c) => c.id === id)!;
    if (!home || words < 20) {
      return mk(`policy-${id}`, cat.label, 'policy', cat.mode === 'hard' ? 5 : 3, 'unknown', null,
        'Sin texto suficiente para evaluar esta política.', `Revisa manualmente la política "${cat.policy}" antes de solicitar AdSense.`);
    }
    const hardHits = termHits(body, cat.hard ?? []);
    const softHits = termHits(body, cat.soft ?? []);
    const failAt = cat.failAt ?? 3;
    const status: Status =
      hardHits.length > 0 ? 'fail'
        : cat.mode === 'hard' ? 'pass'
        : softHits.length >= failAt ? 'fail'
        : softHits.length >= Math.max(2, failAt - 1) ? 'warn'
        : 'pass';
    const evidence = hardHits.length
      ? `Coincidencias directas: ${hardHits.slice(0, 4).join(', ')}`
      : softHits.length
        ? `${softHits.length} términos sensibles: ${softHits.slice(0, 4).join(', ')}`
        : 'Sin coincidencias relevantes.';
    return mk(`policy-${id}`, cat.label, 'policy', cat.mode === 'hard' ? 5 : 3, status,
      hardHits.length || softHits.length ? `${hardHits.length} directas · ${softHits.length} sensibles` : null,
      `${evidence} Política aplicada: ${cat.policy}.`,
      status === 'pass'
        ? 'Mantén el contenido dentro de la política; las revisiones de Google son posteriores a la solicitud.'
        : 'Revisa esas secciones: si el tema es legítimo, contrárestalo con contexto editorial (por ejemplo, un artículo sobre riesgos) o retíralo antes de solicitar AdSense.');
  };

  for (const cat of POLICY_CATEGORIES) out.push(policyStatus(cat.id));

  const langDetect = detectLanguage(text);
  const declaredLang = home?.lang?.slice(0, 2) ?? '';
  const effectiveLang = declaredLang || langDetect.lang;
  out.push(
    mk(
      'policy-language', 'Idioma soportado por AdSense', 'policy', 2,
      !effectiveLang ? 'unknown' : ADSENSE_LANGS.has(effectiveLang) ? 'pass' : 'fail',
      effectiveLang ? `${effectiveLang}${declaredLang ? ' (declarado)' : ' (detectado)'}` : null,
      'AdSense no sirve anuncios en idiomas no soportados; publicar en uno de ellos impide monetizar.',
      'Publica en un idioma soportado o añade una versión en un idioma con demanda publicitaria.',
    ),
    mk(
      'policy-parked', 'El dominio no está aparcado ni en construcción', 'policy', 5,
      !home ? 'unknown' : (() => {
        const hits = termHits(`${home.title} ${text}`, PARKED_PATTERNS);
        return hits.length >= 2 && words < 200 ? 'fail' : hits.length >= 1 && words < 120 ? 'warn' : 'pass';
      })(),
      home ? (() => { const hits = termHits(`${home.title} ${text}`, PARKED_PATTERNS); return hits.length ? hits.slice(0, 2).join(', ') : 'sin señales'; })() : null,
      'Dominios aparcados o "en construcción" se rechazan de forma automática.',
      'Publica el sitio real antes de solicitar. Si es un proyecto en curso, espera a tener contenido completo.',
    ),
    mk(
      'policy-ad-density', 'Anuncios proporcionados al contenido', 'policy', 3,
      !home ? 'unknown' : home.adsCode && words < 200 ? 'warn' : 'pass',
      home ? `${home.adsCode ? 'código de anuncios detectado' : 'sin código de anuncios'} · ${words} palabras` : null,
      'Anuncios sobre páginas sin contenido ("ads on screens without publisher content") es motivo de suspensión, no solo de rechazo.',
      'Retira los bloques de anuncios de páginas vacías, de error o de agradecimiento.',
    ),
  );

  // ---------- C3 Paginas esenciales ----------
  const legal = (key: 'privacy' | 'terms' | 'about' | 'contact', label: string, weight: number, mustHave: boolean) => {
    const probe = ctx.legal.find((l) => l.key === key);
    const status: Status = probe?.found ? 'pass' : !probe || probe.verifiable ? (mustHave ? 'fail' : 'warn') : 'unknown';
    return mk(
      `essential-${key}`, label, 'essential', weight, status,
      probe?.found ? 'encontrada' : probe?.verifiable ? 'no encontrada' : 'no verificable',
      probe?.found
        ? `Verificada en ${probe.url} (HTTP ${probe.status}).`
        : probe?.verifiable
          ? `No se encontró en el menú ni en las rutas habituales (${LEGAL_HINTS[key].slice(0, 3).join(', ')}…).`
          : 'La comprobación no terminó por errores de red: no se puede afirmar que falte.',
      mustHave
        ? 'Es requisito de las políticas de AdSense: una política de privacidad que informe del uso de cookies y de la publicidad personalizada.'
        : 'Refuerza la confianza del revisor: quién está detrás del sitio y cómo contactar.',
    );
  };
  out.push(
    legal('privacy', 'Política de privacidad publicada', 7, true),
    legal('terms', 'Términos y aviso legal', 3, false),
    legal('about', 'Página "sobre el sitio" o autor', 3, false),
    legal('contact', 'Página de contacto operativa', 2, false),
  );

  // Indicador estructural: propiedad del dominio. Peso 0: informa, no puntúa.
  const owned = ctx.normalized.ownership === 'owned';
  const blogspot = ctx.normalized.platform === 'blogspot';
  out.push(
    mk(
      'monetization-domain', 'Dominio verificable para AdSense', 'essential', 0,
      owned || blogspot ? 'pass' : 'warn',
      owned ? ctx.normalized.host : ctx.normalized.subject,
      owned
        ? 'Dominio propio: AdSense puede verificar la propiedad a nivel de dominio.'
        : blogspot
          ? 'Blogger está integrado con AdSense: el blog se puede monetizar desde la cuenta de Blogger.'
          : `Subdominio de plataforma (${ctx.normalized.platform}): el dominio raíz no es tuyo y AdSense no puede verificar la propiedad a nivel de sitio.`,
      owned
        ? 'Mantén el dominio y su DNS bajo tu control.'
        : 'Publica el sitio en un dominio propio (o en Blogger) antes de solicitar AdSense. La auditoría de contenido sigue siendo válida.',
    ),
  );
  // ---------- C4 Navegacion y UX ----------
  const internal = home?.internalLinks.length ?? 0;
  out.push(
    mk(
      'ux-nav', 'Navegación interna suficiente', 'ux', 4,
      !home ? 'unknown' : internal >= 5 ? 'pass' : internal >= 3 ? 'warn' : 'fail',
      home ? `${internal} enlaces internos` : null,
      'Un sitio de una sola página sin enlaces internos se percibe como thin content.',
      'Añade un menú con las secciones principales y enlaza cada artículo desde índices o relacionados.',
    ),
    mk(
      'ux-interstitials', 'Sin capas que tapen el contenido', 'ux', 3,
      !home ? 'unknown' : home.overlaySignals >= 2 ? 'warn' : 'pass',
      home ? `${home.overlaySignals} capas fijas detectadas` : null,
      'Los intersticiales que bloquean el contenido en móvil incumplen los estándares de experiencia publicitaria.',
      'Comprueba manualmente en móvil: si al entrar aparece una capa a pantalla completa, elimínala o hazla descartable al instante.',
    ),
    mk(
      'ux-mobile', 'Adaptado a móvil', 'ux', 4,
      !home ? 'unknown' : home.viewport ? 'pass' : 'fail',
      home ? (home.viewport ? 'viewport declarado' : 'sin viewport') : null,
      'La mayoría del tráfico y de los ingresos viene de móvil; sin viewport el sitio no es usable ahí.',
      'Añade <meta name="viewport" content="width=device-width, initial-scale=1"> y revisa el diseño en pantalla pequeña.',
    ),
    mk(
      'ux-broken-links', 'Sin enlaces rotos en la muestra', 'ux', 3,
      ctx.brokenLinks.length === 0 && ctx.extraPages.length === 0 ? 'unknown'
        : ctx.brokenLinks.length === 0 ? 'pass' : ctx.brokenLinks.length <= 1 ? 'warn' : 'fail',
      ctx.brokenLinks.length ? `${ctx.brokenLinks.length} enlaces roto` : ctx.extraPages.length ? 'muestra sin roturas' : null,
      'Los enlaces roto degradan la experiencia y son señal de abandono.',
      'Corrige o elimina los enlaces que devuelven 404/410.',
    ),
  );

  // ---------- C5 Rastreo tecnico ----------
  const robotsKnown = !!ctx.robots && ctx.robots.reachable;
  const robotsFile = robotsKnown && ctx.robots?.found ? parseRobots(ctx.robots.text) : null;
  const mpAllowed = robotsFile ? isAllowed(robotsFile, ADSENSE_CRAWLERS[0], '/') : true;
  const adsBotAllowed = robotsFile ? isAllowed(robotsFile, ADSENSE_CRAWLERS[1], '/') : true;
  const robotsState = !ctx.robots
    ? null
    : !ctx.robots.reachable
      ? `robots.txt no respondió (${ctx.robots.status ?? 'sin respuesta'}): no se puede afirmar que permita el acceso`
      : ctx.robots.found
        ? 'robots.txt leído'
        : 'sin robots.txt (se permite todo)';

  out.push(
    mk(
      'crawl-https', 'HTTPS activo', 'crawl', 3,
      ctx.normalized.https ? 'pass' : 'fail',
      ctx.normalized.https ? 'https' : 'http',
      'Sin HTTPS el navegador marca el sitio como no seguro y muchos anunciantes no pujan.',
      'Instala un certificado (Let\'s Encrypt o el del hosting) y redirige todo el tráfico http a https.',
    ),
    mk(
      'crawl-mediapartners', 'El rastreador de AdSense puede entrar', 'crawl', 5,
      !robotsKnown ? 'unknown' : mpAllowed ? 'pass' : 'fail',
      ctx.robots?.found ? (mpAllowed ? 'robots.txt permite Mediapartners-Google' : 'robots.txt BLOQUEA Mediapartners-Google') : robotsState,
      'Si robots.txt bloquea a Mediapartners-Google, Google no puede evaluar el contenido y el sitio se rechaza. Un error 5xx o 429 en robots.txt no demuestra permiso: se marca sin datos.',
      'Elimina el bloqueo para Mediapartners-Google y AdsBot-Google en robots.txt, y asegúrate de que robots.txt responde 200.',
    ),
    mk(
      'crawl-adsbot', 'El rastreador de anuncios (AdsBot) puede entrar', 'crawl', 2,
      !robotsKnown ? 'unknown' : adsBotAllowed ? 'pass' : 'warn',
      ctx.robots?.found ? (adsBotAllowed ? 'permitido' : 'bloqueado') : robotsState,
      'AdsBot comprueba la calidad de las páginas donde se muestran anuncios.',
      'Permite AdsBot-Google en robots.txt.',
    ),
    mk(
      'crawl-noindex', 'La portada es indexable', 'crawl', 4,
      !home ? 'unknown' : home.robotsMeta.includes('noindex') || /noindex|\bnone\b/i.test(home.xRobotsTag) ? 'fail' : 'pass',
      home ? (home.robotsMeta.length ? home.robotsMeta.join(',') : home.xRobotsTag ? `X-Robots-Tag: ${home.xRobotsTag}` : 'indexable') : null,
      'Una portada con noindex (en meta o en la cabecera X-Robots-Tag) es invisible para Google: no habrá tráfico ni evaluación positiva.',
      'Elimina <meta name="robots" content="noindex"> y la cabecera X-Robots-Tag: noindex de la portada.',
    ),
    mk(
      'crawl-sitemap', 'Sitemap XML localizable', 'crawl', 2,
      !ctx.sitemap ? 'unknown' : ctx.sitemap.found && ctx.sitemap.urls > 0 ? 'pass' : ctx.sitemap.found ? 'warn' : 'fail',
      ctx.sitemap ? (ctx.sitemap.found ? `${ctx.sitemap.urls} URLs` : 'no encontrado') : null,
      'El sitemap es la forma en que Google descubre todas las páginas que debe evaluar.',
      'Genera sitemap.xml y decláralo en robots.txt con la línea Sitemap:.',
    ),
    mk(
      'crawl-canonical', 'Canonical declarado', 'crawl', 1,
      !home ? 'unknown' : home.canonical ? 'pass' : 'warn',
      home?.canonical || null,
      'Evita duplicados por parámetros y variantes de URL.',
      'Añade <link rel="canonical"> apuntando a la URL definitiva de cada página.',
    ),
    mk(
      'crawl-meta-description', 'Meta description presente', 'crawl', 1,
      !home ? 'unknown' : home.metaDescription.length >= 50 ? 'pass' : home.metaDescription ? 'warn' : 'fail',
      home ? `${home.metaDescription.length} caracteres` : null,
      'No es requisito de AdSense, pero define cómo aparece el sitio en Google y su CTR orgánico.',
      'Escribe descripciones de 120-155 caracteres por página.',
    ),
    mk(
      'crawl-lang', 'Idioma declarado en el HTML', 'crawl', 1,
      !home ? 'unknown' : home.lang ? 'pass' : 'warn',
      home?.lang || null,
      'Ayuda a Google a segmentar el contenido y a servir anuncios en el idioma correcto.',
      'Añade el atributo lang en <html>, por ejemplo lang="es".',
    ),
    mk(
      'crawl-favicon', 'Favicon', 'crawl', 1,
      !home ? 'unknown' : home.favicon ? 'pass' : 'warn',
      home?.favicon || null,
      'Detalle de acabado: refuerza la percepción de sitio cuidado.',
      'Añade un favicon enlazado desde el <head>.',
    ),
  );

  // ---------- C6 Page experience (PSI opcional) ----------
  const mobile = ctx.psi.find((p) => p.strategy === 'mobile') ?? null;
  out.push(
    mk(
      'perf-score', 'Puntuación de rendimiento (Lighthouse, móvil)', 'performance', 4,
      !mobile || mobile.performance === null ? 'unknown' : mobile.performance >= 70 ? 'pass' : mobile.performance >= 50 ? 'warn' : 'fail',
      mobile?.performance != null ? `${Math.round(mobile.performance)}/100` : null,
      'La velocidad afecta a la experiencia y, con ella, a la tasa de visualización de anuncios.',
      'Optimiza imágenes, elimina JavaScript no usado y sirve en CDN.',
    ),
    mk(
      'perf-lcp', 'LCP dentro de objetivo (2,5 s)', 'performance', 3,
      !mobile || mobile.lcpMs === null ? 'unknown' : mobile.lcpMs <= 2500 ? 'pass' : mobile.lcpMs <= 4000 ? 'warn' : 'fail',
      mobile?.lcpMs != null ? `${(mobile.lcpMs / 1000).toFixed(2)} s` : null,
      'El LCP mide cuándo aparece el contenido principal; es la métrica que más pesa en Core Web Vitals.',
      'Prioriza la imagen de cabecera, precarga la fuente principal y reduce el trabajo del servidor.',
    ),
    mk(
      'perf-cls', 'CLS dentro de objetivo (0,1)', 'performance', 2,
      !mobile || mobile.cls === null ? 'unknown' : mobile.cls <= 0.1 ? 'pass' : mobile.cls <= 0.25 ? 'warn' : 'fail',
      mobile?.cls != null ? mobile.cls.toFixed(3) : null,
      'Los saltos de diseño provocan clics accidentales en anuncios y bajan el rendimiento.',
      'Reserva espacio (width/height o aspect-ratio) para imágenes, anuncios y fuentes.',
    ),
    mk(
      'perf-tbt', 'Bloqueo del hilo principal bajo control', 'performance', 2,
      !mobile || mobile.tbtMs === null ? 'unknown' : mobile.tbtMs <= 200 ? 'pass' : mobile.tbtMs <= 600 ? 'warn' : 'fail',
      mobile?.tbtMs != null ? `${Math.round(mobile.tbtMs)} ms` : null,
      'Demasiado JavaScript bloquea la interacción y reduce impresiones visibles.',
      'Divide el JavaScript, carga los scripts de terceros en diferido y revisa etiquetas antiguas.',
    ),
  );

  return out;
}
