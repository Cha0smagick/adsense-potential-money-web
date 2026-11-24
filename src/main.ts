import './styles.css';
import type { AuditOptions } from './core/audit.ts';
import { runAudit } from './core/audit.ts';
import type { AuditReport } from './core/types.ts';
import { GEO_LABELS, NICHES } from './core/lexicon.ts';
import { createBrowserFetcher } from './fetch/chain.ts';
import { runPsi } from './fetch/psi.ts';
import { dispatchDeepAudit } from './deep/dispatch.ts';
import { esc, renderReport } from './ui/render.ts';
import { copySummary, downloadCsv, downloadJson, printReport } from './ui/export.ts';

const STORE_KEY = 'adsense-auditor.settings.v1';

interface Settings {
  sessions: number;
  niche: string;
  country: string;
  mobile: number;
  rpm: string;
  ctr: string;
  psiKey: string;
  engine: 'fast' | 'deep';
  repo: string;
  pat: string;
}

const DEFAULTS: Settings = {
  sessions: 10000,
  niche: 'auto',
  country: 'ES',
  mobile: 0.6,
  rpm: '',
  ctr: '',
  psiKey: '',
  engine: 'fast',
  repo: '',
  pat: '',
};

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* modo privado: no persiste */
  }
}

const settings = loadSettings();
let current: AuditReport | null = null;

// El contenido editorial vive en index.html (HTML inicial, indexable). Aquí solo se
// monta la herramienta: así Google y AdSense ven texto aunque no ejecuten JavaScript.
const app = document.getElementById('app')!;
app.innerHTML = `
<form class="card no-print" id="audit-form" autocomplete="off">
  <div class="grid url">
    <label class="field"><span>URL a auditar</span>
      <input class="big" type="text" id="f-url" placeholder="midominio.com · miblog.blogspot.com · usuario.github.io/mi-proyecto" required />
    </label>
  </div>
  <div class="grid" style="margin-top:12px">
    <label class="field"><span>Sesiones / mes (tráfico actual)</span>
      <input type="number" id="f-sessions" min="0" step="1000" value="${settings.sessions}" />
    </label>
    <label class="field"><span>Nicho</span>
      <select id="f-niche">
        <option value="auto">Detectar automáticamente</option>
        ${NICHES.map((n) => `<option value="${n.id}">${esc(n.label)}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>País del tráfico principal</span>
      <select id="f-country">
        ${Object.entries(GEO_LABELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
      </select>
    </label>
  </div>

  <details class="advanced">
    <summary>Precisión del modelo y motor (opcional)</summary>
    <div class="grid">
      <label class="field"><span>% de tráfico móvil (0–1)</span>
        <input type="number" id="f-mobile" min="0" max="1" step="0.05" value="${settings.mobile}" />
      </label>
      <label class="field"><span>Tu RPM real (USD / 1000 vistas)</span>
        <input type="number" id="f-rpm" min="0" step="0.01" placeholder="ej. 9.40" value="${esc(settings.rpm)}" />
      </label>
      <label class="field"><span>Tu CTR real (ej. 0.012 = 1,2%)</span>
        <input type="number" id="f-ctr" min="0" step="0.001" placeholder="ej. 0.012" value="${esc(settings.ctr)}" />
      </label>
      <label class="field"><span>API key de PageSpeed (mide velocidad)</span>
        <input type="text" id="f-psi" placeholder="AIza… (se guarda solo en este navegador)" value="${esc(settings.psiKey)}" />
      </label>
      <label class="field"><span>Motor</span>
        <select id="f-engine">
          <option value="fast">Rápido — 1 página, ~10 s</option>
          <option value="deep">Profundo — GitHub Actions, hasta 12 páginas</option>
        </select>
      </label>
      <label class="field"><span>Repositorio GitHub (motor profundo)</span>
        <input type="text" id="f-repo" placeholder="usuario/repositorio" value="${esc(settings.repo)}" />
      </label>
      <label class="field"><span>Token PAT (Actions: write)</span>
        <input type="text" id="f-pat" placeholder="github_pat_…" value="${esc(settings.pat)}" />
      </label>
    </div>
    <p style="color:#7d8b87;font-size:12px;margin:10px 0 0">El RPM y el CTR propios tienen prioridad sobre los rangos de industria. Sin API key de PageSpeed, el rendimiento queda como «sin datos» y la confianza baja.</p>
  </details>

  <div class="actions">
    <button class="primary" type="submit" id="btn-run">Analizar sitio</button>
    <button class="ghost" type="button" id="btn-clear">Limpiar</button>
    <span id="status-line" style="color:#93a7a1;font-size:13px"></span>
  </div>
  <div id="log" class="log" style="display:none"></div>
  <div id="error" class="error" style="display:none"></div>
</form>

<div id="results"></div>`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const form = $<HTMLFormElement>('audit-form');
const logBox = $<HTMLDivElement>('log');
const errorBox = $<HTMLDivElement>('error');
const statusLine = $<HTMLSpanElement>('status-line');
const runBtn = $<HTMLButtonElement>('btn-run');

$<HTMLSelectElement>('f-niche').value = settings.niche;
$<HTMLSelectElement>('f-country').value = settings.country;
$<HTMLSelectElement>('f-engine').value = settings.engine;

function logLine(text: string, cls = ''): void {
  logBox.style.display = 'block';
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = `${new Date().toLocaleTimeString('es-ES')}  ${text}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function showError(message: string): void {
  errorBox.style.display = 'block';
  errorBox.textContent = message;
}

function resetMessages(): void {
  errorBox.style.display = 'none';
  errorBox.textContent = '';
  logBox.innerHTML = '';
  logBox.style.display = 'none';
}

function readSettings(): Settings {
  return {
    sessions: Number($<HTMLInputElement>('f-sessions').value) || 0,
    niche: $<HTMLSelectElement>('f-niche').value,
    country: $<HTMLSelectElement>('f-country').value,
    mobile: Math.min(1, Math.max(0, Number($<HTMLInputElement>('f-mobile').value) || 0.6)),
    rpm: $<HTMLInputElement>('f-rpm').value.trim(),
    ctr: $<HTMLInputElement>('f-ctr').value.trim(),
    psiKey: $<HTMLInputElement>('f-psi').value.trim(),
    engine: $<HTMLSelectElement>('f-engine').value as 'fast' | 'deep',
    repo: $<HTMLInputElement>('f-repo').value.trim(),
    pat: $<HTMLInputElement>('f-pat').value.trim(),
  };
}

function wireExports(report: AuditReport): void {
  $<HTMLButtonElement>('btn-pdf').onclick = () => printReport();
  $<HTMLButtonElement>('btn-json').onclick = () => downloadJson(report);
  $<HTMLButtonElement>('btn-csv').onclick = () => downloadCsv(report);
  $<HTMLButtonElement>('btn-copy').onclick = async () => {
    const ok = await copySummary(report);
    logLine(ok ? 'Resumen copiado al portapapeles.' : 'No se pudo copiar (permiso denegado).', ok ? 'ok' : 'err');
  };
}

function paint(report: AuditReport): void {
  current = report;
  $('results').innerHTML = `${renderReport(report)}
  <div class="export-bar no-print">
    <button class="primary" id="btn-pdf" type="button">Descargar PDF</button>
    <button id="btn-json" type="button">JSON crudo</button>
    <button id="btn-csv" type="button">CSV de señales</button>
    <button class="ghost" id="btn-copy" type="button">Copiar resumen</button>
  </div>`;
  wireExports(report);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (runBtn.disabled) return;
  resetMessages();

  const s = readSettings();
  saveSettings(s);
  const url = $<HTMLInputElement>('f-url').value.trim();
  if (!url) {
    showError('Escribe una URL.');
    return;
  }

  runBtn.disabled = true;
  statusLine.textContent = 'Trabajando…';

  try {
    if (s.engine === 'deep') {
      if (!s.pat || !s.repo) throw new Error('El motor profundo necesita el repositorio (usuario/repo) y un token PAT con permiso Actions: write.');
      current = await dispatchDeepAudit({ pat: s.pat, repo: s.repo }, { url, sessions: s.sessions, niche: s.niche }, (m) => logLine(m));
      logLine('Informe profundo recibido.', 'ok');
    } else {
      const { fetcher, state } = createBrowserFetcher(24);
      const psiTask = s.psiKey
        ? runPsi(url, s.psiKey).then((r) => {
            if (r.error) logLine(`PSI: ${r.error}`, 'err');
            else if (r.metrics.length) logLine(`PSI ok: rendimiento móvil ${Math.round(r.metrics[0].performance ?? 0)}/100`, 'ok');
            return r.metrics;
          })
        : Promise.resolve([]);

      logLine(`Auditando ${url} con el motor rápido…`);
      const ticker = window.setInterval(() => {
        statusLine.textContent = `Peticiones: ${state.used}/${state.budget}${state.lastError ? ` · ${state.lastError}` : ''}`;
      }, 400);

      const options: Partial<AuditOptions> = {
        engine: 'fast',
        sessions: s.sessions,
        nicheId: s.niche,
        country: s.country,
        mobileShare: s.mobile,
        ownRpm: s.rpm ? Number(s.rpm) : null,
        ownCtr: s.ctr ? Number(s.ctr) : null,
        maxExtraPages: 0,
        psi: [],
        psiPromise: psiTask,
        publicData: true,
      };

      try {
        current = await runAudit(fetcher, url, options);
      } finally {
        clearInterval(ticker);
      }
      logLine(`Hecho: ${current.meta.requests} peticiones vía ${current.meta.providers.join(', ') || 'sin proveedor'}.`, 'ok');
    }

    paint(current);
    statusLine.textContent = `Puntuación ${current.score.score}/100 · ${current.score.verdict.label}`;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    statusLine.textContent = '';
    showError(error instanceof Error ? error.message : 'Fallo inesperado durante la auditoría.');
    logLine(error instanceof Error ? error.message : 'error', 'err');
  } finally {
    runBtn.disabled = false;
  }
});

$<HTMLButtonElement>('btn-clear').addEventListener('click', () => {
  $<HTMLInputElement>('f-url').value = '';
  $('results').innerHTML = '';
  resetMessages();
  statusLine.textContent = '';
  current = null;
});
