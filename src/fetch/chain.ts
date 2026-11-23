import type { Fetcher, FetchResult } from '../core/types.ts';

// Motor rapido del navegador. Un sitio estatico no puede leer otro dominio: se usa
// una cadena de proxies con CORS verificado (2026-11-23) y presupuesto de peticiones.
//   html  -> jina (HTML renderizado) -> allorigins (HTML crudo) -> jina (texto)
//   texto -> allorigins -> jina (texto)

const JINA = 'https://r.jina.ai/';
const ALLORIGINS = 'https://api.allorigins.win/raw?url=';

interface Provider {
  id: string;
  kinds: ('html' | 'text')[];
  build(url: string, kind: 'html' | 'text'): { url: string; headers: Record<string, string> };
  timeout: number;
  minBytes: number;
}

const PROVIDERS: Provider[] = [
  {
    id: 'jina-html',
    kinds: ['html'],
    timeout: 16000,
    minBytes: 200,
    build: (url) => ({ url: `${JINA}${url}`, headers: { 'x-respond-with': 'html', accept: 'text/html' } }),
  },
  {
    id: 'allorigins',
    kinds: ['html', 'text'],
    timeout: 12000,
    minBytes: 1,
    build: (url) => ({ url: `${ALLORIGINS}${encodeURIComponent(url)}`, headers: {} }),
  },
  {
    id: 'jina-text',
    kinds: ['html', 'text'],
    timeout: 16000,
    minBytes: 1,
    build: (url) => ({ url: `${JINA}${url}`, headers: { 'x-respond-with': 'text' } }),
  },
];

async function attempt(provider: Provider, url: string, kind: 'html' | 'text'): Promise<FetchResult> {
  const started = performance.now();
  const spec = provider.build(url, kind);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeout);
  try {
    const res = await fetch(spec.url, { headers: spec.headers, signal: controller.signal, redirect: 'follow' });
    const body = await res.text();
    const ms = Math.round(performance.now() - started);
    const rest = {
      status: res.status,
      body,
      provider: provider.id,
      ms,
      bytes: body.length,
    };
    if (!res.ok) {
      let note = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { readableMessage?: string; message?: string; name?: string };
        if (parsed.readableMessage || parsed.message) note = `${parsed.name ?? 'error'}: ${(parsed.readableMessage ?? parsed.message ?? '').slice(0, 140)}`;
      } catch {
        /* respuesta no JSON */
      }
      return { ok: false, ...rest, note };
    }
    if (body.length < provider.minBytes) {
      return { ok: false, ...rest, note: `respuesta demasiado corta (${body.length} bytes)` };
    }
    return { ok: true, ...rest };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      provider: provider.id,
      ms: Math.round(performance.now() - started),
      bytes: 0,
      note: error instanceof Error ? (error.name === 'AbortError' ? 'tiempo de espera agotado' : error.message) : 'fallo de red',
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface BrowserFetcherState {
  used: number;
  budget: number;
  cached: number;
  lastError: string | null;
}

export function createBrowserFetcher(budget = 16): { fetcher: Fetcher; state: BrowserFetcherState } {
  const cache = new Map<string, FetchResult>();
  const state: BrowserFetcherState = { used: 0, budget, cached: 0, lastError: null };

  const fetcher: Fetcher = async (url, kind) => {
    const key = `${kind}|${url}`;
    const hit = cache.get(key);
    if (hit) {
      state.cached++;
      return hit;
    }
    if (state.used >= state.budget) {
      state.lastError = 'Presupuesto de peticiones agotado para esta auditoría.';
      return { ok: false, status: 0, body: '', provider: 'budget', ms: 0, bytes: 0, note: 'presupuesto agotado' };
    }

    let last: FetchResult | null = null;
    for (const provider of PROVIDERS) {
      if (!provider.kinds.includes(kind)) continue;
      state.used++;
      const result = await attempt(provider, url, kind);
      if (result.ok) {
        cache.set(key, result);
        return result;
      }
      last = result;
      state.lastError = `${provider.id}: ${result.note ?? 'sin detalle'}`;
      if (state.used >= state.budget) break;
    }
    const failed = last ?? { ok: false, status: 0, body: '', provider: 'none', ms: 0, bytes: 0, note: 'sin proveedores' };
    cache.set(key, failed);
    return failed;
  };

  return { fetcher, state };
}
