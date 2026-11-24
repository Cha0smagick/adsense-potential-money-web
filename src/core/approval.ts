import type { ApprovalResult, GateResult, Ownership, Platform, SignalResult } from './types.ts';
import { PUBLIC_CALIBRATION, probabilityWidth } from './calibration.ts';
import type { CalibrationBand } from './calibration.ts';

// Modelo declarado de aprobacion. Google NO publica tasas de aprobacion ni un SLA:
// esto es una estimacion con anclas impresas, no un hecho. La unica cifra oficial es
// "unos dias; en algunos casos, 2-4 semanas" (developers.google.com/adsense/platforms/transparent/approvals).

export interface ApprovalInput {
  score: number;
  confidence: number;
  gates: GateResult[];
  signals: SignalResult[];
  ownership: Ownership;
  platform: Platform;
  contentPages: number;
  domainAgeYears: number | null;
  adsCode: boolean;
  expectedMonthly: number;
  /** Horas estimadas de reparacion (suma de los hallazgos con perdida). */
  fixHours: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n * 100) / 100;

function interpolate(x: number, points: [number, number][]): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }
  return points[points.length - 1][1];
}

const PROBABILITY_ANCHORS: [number, number][] = [
  [0, 0.02],
  [40, 0.07],
  [55, 0.18],
  [70, 0.45],
  [85, 0.72],
  [95, 0.8],
  [100, 0.85],
];

export function canMonetizeWithAdsense(ownership: Ownership, platform: Platform): boolean {
  if (ownership === 'owned') return true;
  // Blogger esta integrado con AdSense; el resto de subdominios no es verificable a nivel de dominio.
  return platform === 'blogspot';
}

export function computeApproval(input: ApprovalInput): ApprovalResult {
  const canMonetize = canMonetizeWithAdsense(input.ownership, input.platform);
  const triggered = input.gates.filter((g) => g.triggered);
  const worst = triggered.slice().sort((a, b) => a.cap - b.cap)[0] ?? null;

  let readiness = clamp(input.score, 0, 100);
  const drivers: { label: string; delta: number; note: string }[] = [];

  if (worst) {
    const penalty = Math.max(0, 60 - worst.cap * 0.6);
    readiness -= penalty;
    drivers.push({ label: `Bloqueador: ${worst.label}`, delta: -Math.round(penalty), note: `Tope ${worst.cap}/100 mientras esté activo.` });
  }
  if (input.confidence < 0.6) {
    readiness -= 8;
    drivers.push({ label: 'Confianza baja', delta: -8, note: `Solo se resolvió el ${Math.round(input.confidence * 100)} % del peso evaluable.` });
  }
  if (input.contentPages === 0) {
    readiness -= 15;
    drivers.push({ label: 'Sin sitemap de páginas', delta: -15, note: 'No se puede demostrar volumen de contenido.' });
  } else if (input.contentPages < 5) {
    readiness -= 8;
    drivers.push({ label: 'Pocas páginas', delta: -8, note: `${input.contentPages} páginas detectadas: el revisor puede ver poco contenido.` });
  }
  if (!canMonetize) {
    readiness -= 20;
    drivers.push({
      label: 'Sin dominio verificable',
      delta: -20,
      note: 'Subdominio de plataforma: AdSense trabaja a nivel de dominio; hace falta dominio propio.',
    });
  }
  const policyFails = input.signals.filter((s) => s.category === 'policy' && s.status === 'fail' && !triggered.some((g) => g.id === 'severe-policy')).length;
  if (policyFails > 0) {
    const penalty = Math.min(12, policyFails * 3);
    readiness -= penalty;
    drivers.push({ label: 'Coincidencias de política', delta: -penalty, note: `${policyFails} categorías con coincidencias sensibles.` });
  }
  if (input.domainAgeYears !== null && input.domainAgeYears < 0.5) {
    readiness -= 4;
    drivers.push({ label: 'Dominio nuevo', delta: -4, note: 'Menos de 6 meses: contexto, no requisito oficial.' });
  }
  readiness = clamp(Math.round(readiness), 0, 100);

  let base = interpolate(readiness, PROBABILITY_ANCHORS);
  if (!canMonetize) base = Math.min(base, 0.12);
  if (worst?.id === 'severe-policy') base = Math.min(base, 0.05);
  if (worst?.id === 'unreachable' || worst?.id === 'parked') base = Math.min(base, 0.03);
  let appliedBand: CalibrationBand | null = null;
  const rawScore = input.score;
  if (PUBLIC_CALIBRATION.status !== 'failed' && PUBLIC_CALIBRATION.rejected >= 30 && PUBLIC_CALIBRATION.bands.length) {
    const band = PUBLIC_CALIBRATION.bands.find((b) => rawScore >= b.min && rawScore < b.max) ?? PUBLIC_CALIBRATION.bands[PUBLIC_CALIBRATION.bands.length - 1];
    if (band && band.lr > 0) {
      const shrink = PUBLIC_CALIBRATION.status === 'validated' ? 1 : PUBLIC_CALIBRATION.status === 'weak' ? 0.7 : 0.4;
      const priorOdds = base / (1 - base);
      const postOdds = priorOdds * Math.pow(band.lr, shrink);
      base = clamp(postOdds / (1 + postOdds), 0.01, 0.92);
      appliedBand = band;
    }
  }
  base = clamp(round(base), 0.01, 0.92);

  const low = clamp(round(base - probabilityWidth(PUBLIC_CALIBRATION)), 0.01, 0.85);
  const high = clamp(round(base + probabilityWidth(PUBLIC_CALIBRATION)), 0.01, 0.95);

  const median = clamp(4 + (100 - readiness) * 0.12 + (worst ? 8 : 0) + (canMonetize ? 0 : 30), 2, 90);
  const sigma = 0.85;
  const p50 = Math.round(median);
  const p80 = Math.round(clamp(median * Math.exp(0.8416 * sigma), p50, 120));
  const p90 = Math.round(clamp(median * Math.exp(1.2816 * sigma), p80, 150));

  const fixDays = Math.max(1, Math.round((input.fixHours / 8) * 10) / 10);
  const rejectionP = round(1 - base);
  const daily = input.expectedMonthly / 30;

  const applyNow = canMonetize
    ? {
        expectedDays: Math.round((p50 + rejectionP * (fixDays + p50)) * 10) / 10,
        expectedCost: Math.round((p50 + rejectionP * (fixDays + p50)) * daily),
        rejectionP,
      }
    : { expectedDays: Math.round((fixDays + p50) * 10) / 10, expectedCost: Math.round((fixDays + p50) * daily), rejectionP };
  const prepareFirst = {
    expectedDays: Math.round((fixDays + p50) * 10) / 10,
    expectedCost: Math.round((fixDays + p50) * daily),
    fixDays,
  };

  const recommendation: ApprovalResult['recommendation'] =
    canMonetize && base >= 0.3 && applyNow.expectedDays <= prepareFirst.expectedDays ? 'apply-now' : 'prepare-first';

  const notes = [
    'Estimación, no probabilidad oficial: Google no publica tasas de aprobación.',
    'Anclas del modelo: 95→80 %, 85→72 %, 70→45 %, 55→18 %, 40→7 %.',
    'Tiempo anclado a la única cifra oficial: «unos días; en algunos casos, 2-4 semanas».',
    `Calibración pública: ${PUBLIC_CALIBRATION.n} casos, AUC ${PUBLIC_CALIBRATION.auc ?? '—'} (IC99 ${PUBLIC_CALIBRATION.aucLow ?? '—'}–${PUBLIC_CALIBRATION.aucHigh ?? '—'}). Etiquetas autodeclaradas; el LR por banda ajusta el prior con shrinkage. No es una tasa de Google.`,
  ];
  if (appliedBand) {
    notes.push(`Ajuste por banda ${appliedBand.min}-${appliedBand.max}: LR ${appliedBand.lr} (${appliedBand.pos} positivos / ${appliedBand.neg} negativos).`);
  }
  if (!input.adsCode) notes.push('Falta el código de AdSense en la página: es requisito previo a la revisión del sitio.');
  if (!canMonetize) notes.push('Mientras no haya dominio propio, la solicitud no puede aprobarse a nivel de sitio.');

  return {
    readiness,
    probability: { low, base, high },
    days: { p50, p80, p90 },
    drivers: drivers.sort((a, b) => a.delta - b.delta),
    applyNow,
    prepareFirst,
    recommendation,
    calibrated: false,
    validation: PUBLIC_CALIBRATION,
    notes,
  };
}
