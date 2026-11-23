import type { AuditReport } from '../core/types.ts';

// Motor profundo sin servidor: el navegador dispara una GitHub Action con un PAT
// fine-grained (solo Actions: write sobre este repo) y lee el informe comiteado.
// Requiere: repo publicado con .github/workflows/deep-audit.yml y permiso de lectura
// de contenidos. El PAT se guarda solo en el localStorage del navegador.

export interface DeepConfig {
  pat: string;
  repo: string; // "usuario/repositorio"
}

const API = 'https://api.github.com';

function headers(pat: string, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    authorization: `Bearer ${pat}`,
    accept,
    'x-github-api-version': '2022-11-28',
  };
}

function explain(status: number, body: string): string {
  if (status === 401) return 'El token de GitHub no es válido o ha caducado.';
  if (status === 403) return 'El token no tiene permiso sobre este repositorio (necesita Actions: write y Contents: read).';
  if (status === 404) return 'Repositorio o workflow no encontrado. Revisa "usuario/repo" y que exista .github/workflows/deep-audit.yml.';
  if (status === 422) return 'GitHub rechazó la petición: el workflow debe aceptar los inputs url, sessions, niche y requestId.';
  return `GitHub respondió ${status}: ${body.slice(0, 160)}`;
}

export async function dispatchDeepAudit(
  cfg: DeepConfig,
  input: { url: string; sessions: number; niche: string },
  onProgress?: (message: string) => void,
): Promise<AuditReport> {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${API}/repos/${cfg.repo}/actions/workflows/deep-audit.yml/dispatches`, {
    method: 'POST',
    headers: { ...headers(cfg.pat), 'content-type': 'application/json' },
    body: JSON.stringify({
      ref: 'main',
      inputs: { url: input.url, sessions: String(input.sessions), niche: input.niche, requestId },
    }),
  });
  if (!res.ok) throw new Error(explain(res.status, await res.text()));

  onProgress?.('Auditoría profunda lanzada. Crawl de hasta 12 páginas en GitHub Actions…');

  const deadline = Date.now() + 8 * 60 * 1000;
  const path = `reports/${requestId}.json`;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    const file = await fetch(`${API}/repos/${cfg.repo}/contents/${path}?ref=main&t=${Date.now()}`, {
      headers: headers(cfg.pat, 'application/vnd.github.raw+json'),
      cache: 'no-store',
    });
    if (file.status === 200) {
      const text = await file.text();
      try {
        const report = JSON.parse(text) as AuditReport;
        if (report.schema === 'report.v1') return report;
      } catch {
        return await waitFallback(text);
      }
    }
    if (file.status === 401 || file.status === 403) throw new Error(explain(file.status, await file.text()));
    if (file.status >= 500) onProgress?.('GitHub no responde, reintentando…');
    else onProgress?.(`Esperando el informe (${Math.max(0, Math.round((deadline - Date.now()) / 1000))} s restantes)…`);
  }
  throw new Error('La auditoría profunda no terminó en 8 minutos. Revisa la pestaña Actions del repositorio.');
}

async function waitFallback(raw: string): Promise<AuditReport> {
  throw new Error(`El informe llegó con formato inesperado: ${raw.slice(0, 120)}`);
}
