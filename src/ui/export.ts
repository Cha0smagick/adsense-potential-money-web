import type { AuditReport } from '../core/types.ts';

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s: string) => s.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export function reportFilename(report: AuditReport, ext: string): string {
  const stamp = report.createdAt.slice(0, 10);
  return `adsense-${slug(report.target.registrable)}-${stamp}.${ext}`;
}

export function downloadJson(report: AuditReport): void {
  download(reportFilename(report, 'json'), JSON.stringify(report, null, 2), 'application/json');
}

export function downloadCsv(report: AuditReport): void {
  const rows: string[][] = [['id', 'categoria', 'senal', 'estado', 'valor', 'peso', 'impacto_puntos', 'evidencia', 'accion']];
  for (const s of report.score.signals) {
    rows.push([
      s.id,
      s.category,
      s.label,
      s.status,
      s.value ?? '',
      String(s.weight),
      s.impact.toFixed(1),
      s.evidence,
      s.advice,
    ]);
  }
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // BOM para que Excel abra UTF-8 correctamente.
  download(reportFilename(report, 'csv'), `\ufeff${csv}`, 'text/csv;charset=utf-8');
}

export function printReport(): void {
  window.print();
}

export async function copySummary(report: AuditReport): Promise<boolean> {
  const s = report.score;
  const text = [
    `Auditoría AdSense — ${report.target.host}`,
    `Puntuación: ${s.score}/100 (${s.verdict.label}), confianza ${Math.round(s.confidence * 100)}%`,
    `Bloqueadores: ${s.gates.filter((g) => g.triggered).map((g) => g.label).join('; ') || 'ninguno'}`,
    `Ingreso proyectado 12 meses: ${Math.round(report.monetization.horizons[2].base)} USD/mes`,
    `Generado con el auditor el ${new Date(report.createdAt).toLocaleDateString('es-ES')}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
