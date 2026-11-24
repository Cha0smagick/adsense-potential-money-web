// Resultado de la calibración con casos públicos (2026-11-24).
// NO se usa para ajustar la probabilidad: el estudio no discriminó. Se publica
// como evidencia y como advertencia, que es lo honesto.

export interface PublicCalibration {
  status: 'unvalidated' | 'failed' | 'weak' | 'validated';
  collectedAt: string;
  n: number;
  approved: number;
  rejected: number;
  staleRejected: number;
  auc: number | null;
  medianApproved: number | null;
  medianRejected: number | null;
  note: string;
  dataset: string;
  measured: string;
  report: string;
  method: string;
}

export const PUBLIC_CALIBRATION: PublicCalibration = {
  status: 'failed',
  collectedAt: '2026-11-24',
  n: 15,
  approved: 6,
  rejected: 9,
  staleRejected: 7,
  auc: 0.51,
  medianApproved: 92.2,
  medianRejected: 83.5,
  note:
    'El score no separó aprobados de rechazados (AUC 0,51). Siete de los nueve rechazos ya muestran código de anuncios: fueron aprobados después. Las features se midieron hoy, no en la fecha de la decisión, y solo 1 de 4 sitios tenía captura histórica en Wayback. No hay base para calibrar la probabilidad.',
  dataset: './data/approval-cases.json',
  measured: './data/approval-cases.measured.json',
  report: './data/calibration.md',
  method:
    '15 casos públicos: 9 rechazos del foro de AdSense (con URL y fecha) y 6 aprobaciones verificables (2 casos publicados + 4 sitios que hoy sirven AdSense). Medidos con el motor profundo el 2026-11-24. AUC por Mann-Whitney; sesgo de selección y etiquetas desactualizadas declarados.',
};

/** Ancho del intervalo cuando el modelo no está validado. */
export function probabilityWidth(calibration: PublicCalibration): number {
  if (calibration.status === 'validated') return 0.05;
  if (calibration.status === 'weak') return 0.12;
  return 0.2;
}
