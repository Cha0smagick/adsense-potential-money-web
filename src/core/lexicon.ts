// Lexico de riesgo alineado con las politicas publicas de Google para publishers.
// Cada categoria cita su politica oficial. La herramienta es independiente: no
// sustituye la revision de Google ni garantiza aprobacion.
// Normalizacion: el texto se compara sin acentos ni mayusculas (ver norm()).

export interface PolicyCategory {
  id: string;
  label: string;
  /** Nombre oficial de la politica de Google. */
  policy: string;
  url: string;
  /** `hard` = 1 coincidencia basta para bloquear. `soft` = hacen falta varias. */
  mode: 'hard' | 'soft';
  /** Umbral de coincidencias distintas para pasar de aviso a fallo (solo mode soft). */
  failAt?: number;
  hard?: string[];
  soft?: string[];
}

export const ADSENSE_HELP = 'https://support.google.com/adsense/answer/10502938';

export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: 'adult',
    label: 'Contenido sexual',
    policy: 'Sexual content',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'hard',
    hard: [
      'pornografia', 'porno gratis', 'sexo explicito', 'sexo oral', 'sexo anal', 'porno casero',
      'videos porno', 'peliculas porno', 'xxx', 'escort', 'escorts', 'prostitutas', 'prostitucion',
      'camgirl', 'camsex', 'onlyfans', 'hentai', 'rule34', 'porno gay', 'porno lesbico',
      'explicit nudity', 'hardcore porn', 'sex cam', 'adult video', 'adult content',
    ],
    soft: ['erotico', 'erotica', 'desnudo', 'desnuda', 'sensual', 'fetish', 'bdsm', 'nude', 'nsfw'],
  },
  {
    id: 'violence',
    label: 'Violencia y contenido peligroso',
    policy: 'Dangerous or derogatory content',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 3,
    hard: [
      'como fabricar una bomba', 'como hacer una bomba', 'instrucciones para matar',
      'how to make a bomb', 'build a bomb', 'kill yourself instructions',
      'apologia del terrorismo', 'enaltece al terrorismo', 'glorificacion del terrorismo',
    ],
    soft: [
      'decapitacion', 'gore', 'snuff', 'tortura', 'mutilacion', 'asesinato brutal',
      'suicidio', 'autolesion', 'autolesiones', 'anorexia', 'bulimia', 'pro ana', 'pro mia',
      'beheading', 'murder video', 'self harm', 'self-harm', 'terrorismo', 'yihad', 'jihad',
      'nazi', 'supremacia blanca', 'white supremacy', 'incitacion al odio', 'hate speech',
    ],
  },
  {
    id: 'weapons',
    label: 'Armas y explosivos',
    policy: 'Dangerous products or services (weapons)',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 2,
    hard: [
      'venta de armas', 'comprar arma de fuego', 'pistola sin licencia', 'fusil de asalto venta',
      'buy a gun online', 'ghost gun', 'silenciador casero', 'explosivos caseros',
    ],
    soft: ['rifle', 'pistola', 'municion', 'ammo', 'silenciador', 'supresor', 'ballesta', 'cuchillo tactico', 'taser', 'gas pimienta'],
  },
  {
    id: 'drugs',
    label: 'Drogas y sustancias',
    policy: 'Recreational drugs / Drug paraphernalia',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 2,
    hard: [
      'comprar cocaina', 'comprar heroina', 'comprar metanfetamina', 'comprar mdma',
      'buy cocaine online', 'buy heroin', 'buy meth', 'vender droga',
      'cultivo de marihuana paso a paso', 'como cultivar marihuana',
    ],
    soft: ['cocaina', 'heroina', 'metanfetamina', 'mdma', 'extasis', 'lsd', 'ketamina', 'fentanilo', 'cannabis', 'marihuana', 'porro', 'bong', 'grinder', 'vape', 'vapeo'],
  },
  {
    id: 'gambling',
    label: 'Apuestas y juegos de azar',
    policy: 'Gambling and games',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 3,
    hard: [
      'casino online', 'casino online españa', 'ruleta online', 'tragaperras online',
      'apuestas deportivas online', 'bonos de casino', 'bono sin deposito',
      'online casino', 'betting odds', 'sports betting', 'free spins', 'apostar dinero real',
    ],
    soft: ['casino', 'apuesta', 'apuestas', 'ruleta', 'blackjack', 'poker', 'bingo', 'tragaperras', 'slot', 'jackpot', 'cuota', 'betting'],
  },
  {
    id: 'pharma',
    label: 'Farmacia y suplementos',
    policy: 'Healthcare and medicines (prescription drugs)',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 2,
    hard: [
      'comprar viagra', 'viagra sin receta', 'cialis sin receta', 'comprar ansioliticos',
      'buy viagra online', 'buy prescription drugs online', 'farmacia online sin receta',
    ],
    soft: ['viagra', 'cialis', 'tramadol', 'ansiolitico', 'diazepam', 'oxido nitroso', 'esteroides anabolicos', 'anabolic steroids', 'sustancia milagrosa', 'cura el cancer'],
  },
  {
    id: 'dishonest',
    label: 'Conducta deshonesta y piratería',
    policy: 'Enabling dishonest behavior',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 2,
    hard: [
      'descargar peliculas gratis sin registro', 'ver series gratis sin registro',
      'descargar libros pirata', 'epub pirata', 'pdf pirata', 'crackear', 'serial de activacion',
      'keygen', 'hackear whatsapp', 'hackear instagram', 'espiar movil sin acceso',
      'tarjetas de credito gratis', 'generador de tarjetas', 'free movie download',
      'watch free without registration', 'download cracked', 'carding tutorial',
    ],
    soft: ['pirata', 'pirateado', 'warez', 'torrent', 'crack', 'cheat', 'trampa', 'hackear', 'espiar', 'hackear cuenta', 'mod menu', 'apk mod'],
  },
  {
    id: 'misrepresentative',
    label: 'Contenido engañoso o clickbait',
    policy: 'Misrepresentative content',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 3,
    hard: [
      'gana dinero desde casa sin trabajar', 'hazte rico en una semana', 'metodo infalible para ganar',
      'haz clic para ganar', 'clickbait garantizado', 'hack de fortuna', 'dinero facil y rapido',
      'get rich quick guaranteed', 'make money online guaranteed', 'miracle cure',
    ],
    soft: ['increible', 'no vas a creer', 'impactante', 'shocking', 'you wont believe', 'te va a sorprender', 'garantizado', '100% efectivo', 'metodo secreto', 'truco revelado', 'antes y despues'],
  },
  {
    id: 'illegal',
    label: 'Contenido ilegal',
    policy: 'Illegal content',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'hard',
    hard: [
      'documentos falsos', 'pasaporte falso', 'dni falso', 'titulo universitario falso',
      'fake id', 'counterfeit money', 'dinero falsificado', 'compra de organos',
      'child sexual abuse material', 'csam',
    ],
    soft: ['falsificacion', 'falsificar', 'contrabando', 'soborno', 'blanqueo de capitales', 'money laundering'],
  },
  {
    id: 'intellectual-property',
    label: 'Propiedad intelectual',
    policy: 'Intellectual property abuse',
    url: 'https://support.google.com/adsense/answer/10502938',
    mode: 'soft',
    failAt: 4,
    hard: ['descargar gratis pelicula completa estreno', 'ver gratis sin pagar estreno', 'full movie free hd no registration'],
    soft: ['descargar gratis', 'ver online gratis', 'streaming gratis', 'audio libro gratis', 'pdf completo gratis', 'descargar epub', 'sin pagar', 'free download', 'watch online free'],
  },
];

/** Patrones de dominio aparcado / en construccion (causa tipica de rechazo). */
export const PARKED_PATTERNS = [
  'dominio en venta', 'comprar este dominio', 'este dominio esta en venta', 'dominio aparcado',
  'domain for sale', 'buy this domain', 'this domain is for sale', 'parked domain', 'parked free',
  'en construccion', 'sitio en construccion', 'under construction', 'coming soon', 'proximamente',
  'web en mantenimiento', 'cuenta suspendida', 'default web page', 'apache2 ubuntu default page',
  'iis windows server', 'welcome to nginx', 'index of /', 'página no encontrada', 'page not found',
];

/** Nombres de secciones legales por idioma (para descubrir enlaces). */
export const LEGAL_HINTS: Record<'privacy' | 'terms' | 'about' | 'contact', string[]> = {
  privacy: ['privacidad', 'privacy', 'politica de privacidad', 'aviso de privacidad', 'proteccion de datos', 'datenschutz'],
  terms: ['terminos', 'condiciones', 'aviso legal', 'legal notice', 'terms', 'tos', 'terminos de uso'],
  about: ['sobre nosotros', 'sobre mi', 'quienes somos', 'about', 'acerca de', 'quien soy', 'company'],
  contact: ['contacto', 'contact', 'kontakt', 'escribenos'],
};

/** Rutas probadas directamente si el menu no las enlaza. */
export const LEGAL_PROBES: Record<'privacy' | 'terms' | 'about' | 'contact', string[]> = {
  privacy: ['/privacidad', '/politica-de-privacidad', '/privacy-policy', '/privacy', '/aviso-legal/privacy'],
  terms: ['/terminos', '/terminos-y-condiciones', '/aviso-legal', '/terms', '/terms-of-service'],
  about: ['/sobre-nosotros', '/sobre-mi', '/about', '/quienes-somos'],
  contact: ['/contacto', '/contact'],
};

export interface NicheDef {
  id: string;
  label: string;
  /** [bajo, medio, alto] page RPM en USD para trafico US. Rango de industria, calibrable. */
  rpm: [number, number, number];
  ctr: number;
  keywords: string[];
}

// Rangos de industria (USD, trafico mayoritariamente US). Se sustituyen por datos
// propios del usuario en cuanto existan: el campo "RPM propio" tiene prioridad.
export const NICHES: NicheDef[] = [
  { id: 'finance', label: 'Finanzas y seguros', rpm: [18, 30, 45], ctr: 0.012, keywords: ['seguro', 'hipoteca', 'inversion', 'invertir', 'prestamo', 'credito', 'tarjeta de credito', 'plan de pensiones', 'fondo indexado', 'bolsa', 'dividendos', 'asesor financiero', 'insurance', 'mortgage', 'investing', 'loan', 'credit card', 'etf'] },
  { id: 'legal', label: 'Legal y abogacía', rpm: [15, 26, 40], ctr: 0.011, keywords: ['abogado', 'bufete', 'demanda', 'indemnizacion', 'herencia', 'divorcio', 'despido', 'juridico', 'lawyer', 'attorney', 'lawsuit', 'claim', 'compensation'] },
  { id: 'tech', label: 'Tecnología y software', rpm: [10, 18, 30], ctr: 0.013, keywords: ['software', 'aplicacion', 'saas', 'hosting', 'servidor', 'programacion', 'python', 'javascript', 'inteligencia artificial', 'cloud', 'vpn', 'api', 'gadget', 'movil', 'smartphone', 'android', 'iphone', 'tecnologia', 'informatica'] },
  { id: 'health', label: 'Salud y bienestar', rpm: [8, 14, 22], ctr: 0.014, keywords: ['salud', 'sintomas', 'tratamiento', 'medico', 'dieta', 'nutricion', 'ejercicio', 'perder peso', 'ansiedad', 'dolor', 'health', 'symptoms', 'treatment', 'weight loss', 'doctor'] },
  { id: 'home', label: 'Hogar y jardín', rpm: [7, 11, 18], ctr: 0.016, keywords: ['jardin', 'plantas', 'muebles', 'decoracion', 'reformar', 'cocina', 'bano', 'limpieza', 'bricolaje', 'home', 'garden', 'furniture', 'diy', 'renovation'] },
  { id: 'auto', label: 'Automoción', rpm: [6, 10, 16], ctr: 0.014, keywords: ['coche', 'coches', 'motor', 'neumaticos', 'seguro de coche', 'taller', 'electrico', 'car', 'cars', 'engine', 'tires', 'mechanic'] },
  { id: 'travel', label: 'Viajes', rpm: [5, 9, 14], ctr: 0.015, keywords: ['viaje', 'viajes', 'vuelos', 'hotel', 'destino', 'turismo', 'playa', 'ruta', 'travel', 'flights', 'hotel', 'destination', 'itinerary'] },
  { id: 'education', label: 'Educación', rpm: [4, 8, 12], ctr: 0.017, keywords: ['curso', 'aprender', 'estudiar', 'examen', 'universidad', 'clases', 'course', 'learn', 'study', 'exam', 'university'] },
  { id: 'food', label: 'Comida y recetas', rpm: [4, 8, 12], ctr: 0.018, keywords: ['receta', 'recetas', 'cocina', 'postre', 'ingredientes', 'hornear', 'comida', 'recipe', 'recipes', 'cooking', 'dessert', 'baking', 'dinner'] },
  { id: 'beauty', label: 'Moda y belleza', rpm: [4, 7, 10], ctr: 0.017, keywords: ['moda', 'belleza', 'maquillaje', 'crema', 'piel', 'pelo', 'tendencia', 'outfit', 'fashion', 'beauty', 'makeup', 'skincare', 'hair'] },
  { id: 'news', label: 'Noticias', rpm: [2, 4, 7], ctr: 0.012, keywords: ['noticias', 'actualidad', 'ultima hora', 'politica', 'economia', 'sucesos', 'news', 'breaking', 'politics', 'world'] },
  { id: 'entertainment', label: 'Entretenimiento y juegos', rpm: [2, 4, 6], ctr: 0.013, keywords: ['juego', 'juegos', 'videojuego', 'cine', 'pelicula', 'serie', 'musica', 'celebridad', 'game', 'gaming', 'movie', 'series', 'music', 'celebrity'] },
  { id: 'general', label: 'General / blog personal', rpm: [3, 6, 9], ctr: 0.015, keywords: [] },
];

export const COUNTRY_FACTOR: Record<string, number> = {
  US: 1.0, CA: 0.95, GB: 0.95, AU: 0.9, NZ: 0.85, IE: 0.85,
  DE: 0.85, NL: 0.85, SE: 0.85, DK: 0.85, NO: 0.85, FI: 0.8, CH: 0.95, AT: 0.8, BE: 0.8,
  FR: 0.8, IT: 0.65, ES: 0.6, PT: 0.5, PL: 0.45, CZ: 0.4, GR: 0.4, TR: 0.3, RU: 0.3,
  MX: 0.35, CL: 0.35, BR: 0.35, UY: 0.4, AR: 0.3, CO: 0.3, PE: 0.28, EC: 0.25, VE: 0.2, BO: 0.22, PY: 0.25, CR: 0.35, PA: 0.35, DO: 0.3, GT: 0.25,
  OTHER: 0.45,
};

export const GEO_LABELS: Record<string, string> = {
  US: 'Estados Unidos', CA: 'Canadá', GB: 'Reino Unido', AU: 'Australia', NZ: 'Nueva Zelanda', IE: 'Irlanda',
  DE: 'Alemania', NL: 'Países Bajos', SE: 'Suecia', DK: 'Dinamarca', NO: 'Noruega', FI: 'Finlandia',
  CH: 'Suiza', AT: 'Austria', BE: 'Bélgica', FR: 'Francia', IT: 'Italia', ES: 'España', PT: 'Portugal',
  PL: 'Polonia', CZ: 'Chequia', GR: 'Grecia', TR: 'Turquía', RU: 'Rusia',
  MX: 'México', CL: 'Chile', BR: 'Brasil', UY: 'Uruguay', AR: 'Argentina', CO: 'Colombia', PE: 'Perú',
  EC: 'Ecuador', VE: 'Venezuela', BO: 'Bolivia', PY: 'Paraguay', CR: 'Costa Rica', PA: 'Panamá',
  DO: 'Rep. Dominicana', GT: 'Guatemala', OTHER: 'Otro / mixto',
};
