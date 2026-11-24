import type { EconomicsResult } from './types.ts';

// Economia del sitio. Todo numero sale de una formula declarada y de un dato medido
// o aportado por el usuario. Nada de "ingresos estimados" sin mecanismo.

export interface EconomicsInput {
  sessions: number;
  pagesPerVisit: number;
  rpm: { low: number; base: number; high: number };
  contentPages: number | null;
  avgWords: number | null;
  /** RPM real que el usuario ha medido en su cuenta. */
  currentRpm: number | null;
  /** false cuando el sitio no puede mostrar anuncios (subdominio no verificable, idioma no soportado...). */
  canMonetize: boolean;
}

/** Sesiones/mes sostenibles por pagina segun su profundidad. Constantes declaradas. */
export function sessionsPerPage(words: number | null): number {
  if (words === null) return 300;
  if (words < 300) return 120;
  if (words <= 800) return 300;
  return 500;
}

export function computeEconomics(input: EconomicsInput): EconomicsResult {
  const sessions = Math.max(0, input.sessions);
  const ppv = Math.max(1, input.pagesPerVisit);
  const perPage = sessionsPerPage(input.avgWords);
  const contentPages = input.contentPages && input.contentPages > 0 ? input.contentPages : null;
  const capacitySessions = contentPages ? contentPages * perPage : Math.max(sessions * 6, sessions);

  const expectedMonthly = (sessions * ppv * input.rpm.base) / 1000;
  const grossMonthly = (Math.max(sessions, capacitySessions) * ppv * input.rpm.high) / 1000;
  const currentMonthly =
    input.canMonetize && input.currentRpm && input.currentRpm > 0
      ? (sessions * ppv * input.currentRpm) / 1000
      : 0;
  const gapMonthly = Math.max(0, expectedMonthly - currentMonthly);
  const gapRatio = expectedMonthly > 0 ? Math.min(1, gapMonthly / expectedMonthly) : 0;
  const currentKnown = !input.canMonetize || (input.currentRpm !== null && input.currentRpm > 0);
  const gapLabel: EconomicsResult['gapLabel'] = !input.canMonetize ? 'bloqueado' : currentKnown ? 'medida' : 'potencial';

  const drivers = [
    `${sessions.toLocaleString('es-ES')} sesiones/mes × ${ppv.toFixed(1)} páginas/vista.`,
    `RPM base ${input.rpm.base.toFixed(2)} USD y techo ${input.rpm.high.toFixed(2)} USD (nicho, país y dispositivo).`,
    contentPages
      ? `Capacidad: ${contentPages.toLocaleString('es-ES')} páginas × ${perPage} sesiones/página (${input.avgWords ?? 'sin'} palabras de media).`
      : 'Sin páginas de sitemap: capacidad estimada como 6× el tráfico actual.',
    input.canMonetize
      ? input.currentRpm
        ? `Ingreso actual con tu RPM real de ${input.currentRpm.toFixed(2)} USD.`
        : 'Sin RPM propio: el ingreso actual se asume 0 hasta que AdSense sirva anuncios.'
      : 'El sitio no es monetizable con AdSense tal como está (dominio no verificable o idioma no admitido): ingreso actual 0.',
  ];

  return {
    grossMonthly: round2(grossMonthly),
    expectedMonthly: round2(expectedMonthly),
    currentMonthly: round2(currentMonthly),
    gapMonthly: round2(gapMonthly),
    gapRatio: Math.round(gapRatio * 1000) / 1000,
    currentKnown,
    gapLabel,
    capacitySessions: Math.round(capacitySessions),
    contentPages: contentPages ?? 0,
    avgWords: input.avgWords,
    drivers,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
