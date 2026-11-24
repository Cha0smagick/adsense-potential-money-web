import { CALIBRATION } from '../data/calibration.ts';
import type { CalibrationBand, CalibrationStatus, PublicCalibrationData } from '../data/calibration.ts';

export type PublicCalibration = PublicCalibrationData;
export type { CalibrationBand, CalibrationStatus, PublicCalibrationData };

// Tabla de calibración generada desde la muestra pública. Si `bands` está vacío,
// el modelo usa solo sus anclas (no validado).
export const PUBLIC_CALIBRATION: PublicCalibration = CALIBRATION;

/** Ancho del intervalo según el estado de validación. */
export function probabilityWidth(calibration: PublicCalibration): number {
  if (calibration.status === 'validated') return 0.06;
  if (calibration.status === 'weak') return 0.12;
  if (calibration.status === 'pilot') return 0.18;
  return 0.2;
}
