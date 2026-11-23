import type { ProjectionInput, ProjectionResult, ScenarioPoint } from './types.ts';
import { COUNTRY_FACTOR } from './lexicon.ts';

// Modelo de proyeccion. Todas las cifras son condicionales a los supuestos que se
// devuelven en `assumptions` y se imprimen junto al resultado: no es una promesa.
// Fuente de los RPM: rangos de industria por nicho, anclados a trafico de EE.UU.
// Se sustituyen automaticamente por `ownRpm`/`ownCtr` cuando el usuario aporta sus datos.

const AD_UNITS_PER_PAGE = 3;
const INFLATION = 0.03;
const K_BASE = 0.18;

function deviceFactor(mobileShare: number): number {
  const m = Math.min(1, Math.max(0, mobileShare));
  // Supuesto de industria: el RPM movil ronda el 65% del de escritorio.
  return 1 + (1 - m) * 0.25 - m * 0.35;
}

function logistic(month: number, s0: number, sMax: number, k: number): number {
  if (month <= 0) return s0;
  if (sMax <= s0) return s0;
  return sMax / (1 + (sMax / s0 - 1) * Math.exp(-k * month));
}

function revenueAt(sessions: number, rpm: number, pagesPerVisit: number, month: number): number {
  const inflated = rpm * Math.pow(1 + INFLATION, month / 12);
  return (sessions * pagesPerVisit * inflated) / 1000;
}

export function project(input: ProjectionInput): ProjectionResult {
  const sessions = Math.max(0, input.sessions);
  const ppv = Math.max(1, input.pagesPerVisit);
  const geo = input.country ? countryFactor(input.country) : 0.45;
  const dev = deviceFactor(input.mobileShare);

  const nicheBase = input.niche.rpm[1];
  const low = input.ownRpm ?? input.niche.rpm[0] * geo * dev;
  const high = input.ownRpm ?? input.niche.rpm[2] * geo * dev;
  const baseRpm = input.ownRpm ?? nicheBase * geo * dev;

  // El rendimiento solo modula cuando hay medicion real de PSI; sin datos no se inventa.
  const quality = input.ownRpm !== null || input.perfNorm === null
    ? 1
    : Math.min(1, Math.max(0.75, 0.75 + 0.25 * input.perfNorm));

  const rpmBase = baseRpm * quality;
  const ctr = input.ownCtr ?? Math.min(0.04, Math.max(0.002, input.niche.ctr * (1 + (1 - input.mobileShare) * 0.15)));

  const pageviews = sessions * ppv;
  const impressions = pageviews * AD_UNITS_PER_PAGE;
  const clicks = impressions * ctr;
  const revenueMonth = (pageviews * rpmBase) / 1000;

  // Techo de sesiones: si hay paginas de contenido, ~400 sesiones/mes por pagina es un
  // techo conservador para un nicho medio. Sin datos, 6x el trafico actual.
  const sMax = input.contentPages && input.contentPages > 0
    ? Math.max(sessions * 1.2, input.contentPages * 400)
    : Math.max(sessions * 1.2, sessions * 6);

  const makeSeries = (rpm: number, k: number, ceiling: number, label: ScenarioPoint[]): ScenarioPoint[] => {
    const out: ScenarioPoint[] = [];
    for (let m = 1; m <= 60; m++) {
      const s = logistic(m, sessions, ceiling, k);
      out.push({ month: m, sessions: Math.round(s), revenue: Math.round(revenueAt(s, rpm, ppv, m)) });
    }
    return out;
  };

  const baseSeries = makeSeries(rpmBase, K_BASE, sMax, []);
  const pessSeries = makeSeries(rpmBase * 0.8, K_BASE * 0.7, Math.max(sessions * 1.2, sMax * 0.5), []);
  const optSeries = makeSeries(rpmBase * 1.25, K_BASE * 1.25, sMax * 1.6, []);

  const at = (series: ScenarioPoint[], months: number) => series[Math.min(series.length, Math.max(1, months)) - 1];
  const cumulative = baseSeries.reduce((acc, p) => acc + p.revenue, 0);

  const horizons = [1, 6, 12, 60].map((months) => ({
    months,
    base: at(baseSeries, months).revenue,
    pessimistic: at(pessSeries, months).revenue,
    optimistic: at(optSeries, months).revenue,
    cumulative: baseSeries.slice(0, months).reduce((acc, p) => acc + p.revenue, 0),
  }));

  const target = 1000;
  const sessionsNeeded = rpmBase > 0 ? target / ((rpmBase / 1000) * ppv) : 0;

  const assumptions = [
    `RPM base: ${input.ownRpm !== null ? 'tus datos reales de AdSense' : `${nicheBase} USD/1000 vistas (${input.niche.label}, rango de industria)`}.`,
    `Factor geográfico (${input.country || 'mixto'}): ×${geo.toFixed(2)}.`,
    `Mezcla de dispositivos: ${(input.mobileShare * 100).toFixed(0)}% móvil, ×${dev.toFixed(2)}.`,
    input.perfNorm !== null && input.ownRpm === null
      ? `Ajuste por rendimiento medida (PSI ${Math.round(input.perfNorm * 100)}): ×${quality.toFixed(2)}.`
      : 'Sin RPM propio no se aplica ajuste por rendimiento (neutro).',
    `${AD_UNITS_PER_PAGE} bloques de anuncio por página, CTR ${(ctr * 100).toFixed(2)}%, inflación de CPM ${(INFLATION * 100).toFixed(0)}% anual.`,
    `Crecimiento logístico con techo de ${Math.round(sMax).toLocaleString('es')} sesiones/mes${input.contentPages ? ` (${input.contentPages} páginas × 400 sesiones)` : ' (6× el tráfico actual)'}.`,
    'Los tres escenarios (pesimista ×0.8 RPM, base, optimista ×1.25 RPM) no son intervalos de confianza estadística.',
  ];

  return {
    rpm: {
      low: Math.round(low * 100) / 100,
      base: Math.round(rpmBase * 100) / 100,
      high: Math.round(high * 100) / 100,
    },
    ctr,
    pageviewsMonth: Math.round(pageviews),
    impressionsMonth: Math.round(impressions),
    clicksMonth: Math.round(clicks),
    impliedCpc: clicks > 0 ? Math.round((revenueMonth / clicks) * 100) / 100 : 0,
    scenarios: [
      { id: 'pessimistic', label: 'Pesimista', points: pessSeries },
      { id: 'base', label: 'Base', points: baseSeries },
      { id: 'optimistic', label: 'Optimista', points: optSeries },
    ],
    horizons,
    inverse: {
      revenueTarget: target,
      sessionsNeeded: Math.round(sessionsNeeded),
      pagesNeeded: Math.ceil(sessionsNeeded / 400),
    },
    assumptions,
  };
}

function countryFactor(country: string): number {
  return COUNTRY_FACTOR[country] ?? COUNTRY_FACTOR.OTHER;
}
