import type { NormalizedUrl, PublicData } from '../core/types.ts';

// Datos públicos del dominio, sin claves ni backend. CORS verificado el 2026-11-24:
// rdap.org, dns.google, tranco-list.eu y archive.org/wayback/available responden con
// Access-Control-Allow-Origin: *. web.archive.org/cdx no lo envía: en el navegador
// fallará y se marca como no disponible; en el motor profundo (Node) sí funciona.

const TIMEOUT = 8000;

interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  note: string;
}

async function getJson<T>(url: string, timeout = TIMEOUT): Promise<JsonResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, data: null, note: `HTTP ${res.status}` };
    return { ok: true, status: res.status, data: JSON.parse(text) as T, note: '' };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      note: error instanceof Error && error.name === 'AbortError' ? 'tiempo de espera agotado' : 'sin respuesta',
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseWaybackTimestamp(ts: string | undefined): string | null {
  if (!ts || !/^\d{14}$/.test(ts)) return null;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, [string, unknown, string, unknown][]];
}

interface RdapResponse {
  events?: { eventAction?: string; eventDate?: string }[];
  entities?: RdapEntity[];
  status?: string[];
}

function registrarOf(rdap: RdapResponse): string | null {
  for (const entity of rdap.entities ?? []) {
    if (!entity.roles?.includes('registrar')) continue;
    const vcard = entity.vcardArray?.[1] ?? [];
    const fn = vcard.find((entry) => entry[0] === 'fn');
    if (fn && typeof fn[3] === 'string') return fn[3];
  }
  return null;
}

interface DnsAnswer {
  Answer?: { name: string; type: number; data: string }[];
}

async function dns(name: string, type: string): Promise<string[]> {
  const res = await getJson<DnsAnswer>(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
  if (!res.ok || !res.data?.Answer) return [];
  return res.data.Answer.map((a) => a.data.replace(/^"|"$/g, '').trim()).filter(Boolean);
}

interface TrancoResponse {
  domain?: string;
  ranks?: { date: string; rank: number }[];
}

export async function collectPublicData(target: NormalizedUrl): Promise<PublicData> {
  const domain = target.registrable;
  const platform = target.ownership === 'platform';
  const sources: PublicData['sources'] = [];

  const [rdapRes, trancoRes, waybackRes, a, ns, mx, txt, dmarc] = await Promise.all([
    platform ? Promise.resolve({ ok: false, status: 0, data: null, note: 'subdominio de plataforma' }) : getJson<RdapResponse>(`https://rdap.org/domain/${domain}`),
    platform ? Promise.resolve({ ok: false, status: 0, data: null, note: 'subdominio de plataforma' }) : getJson<TrancoResponse>(`https://tranco-list.eu/api/ranks/domain/${domain}`),
    getJson<{ archived_snapshots?: { closest?: { timestamp?: string; available?: boolean } } }>(
      `https://archive.org/wayback/available?url=${encodeURIComponent(target.host)}`,
    ),
    dns(target.host, 'A'),
    dns(target.host, 'NS'),
    dns(target.host, 'MX'),
    dns(target.host, 'TXT'),
    dns(`_dmarc.${target.host}`, 'TXT'),
  ]);

  sources.push({ name: 'RDAP', url: `https://rdap.org/domain/${domain}`, ok: rdapRes.ok, note: rdapRes.ok ? '' : rdapRes.note });
  sources.push({ name: 'Tranco', url: `https://tranco-list.eu/api/ranks/domain/${domain}`, ok: trancoRes.ok, note: trancoRes.ok ? '' : trancoRes.note });
  sources.push({ name: 'Wayback', url: 'https://archive.org/wayback/available', ok: waybackRes.ok, note: waybackRes.ok ? '' : waybackRes.note });
  sources.push({ name: 'DNS (A/NS/MX/TXT)', url: 'https://dns.google/resolve', ok: a.length + ns.length + mx.length + txt.length > 0, note: '' });

  const rdap = rdapRes.ok && rdapRes.data
    ? (() => {
        const events = rdapRes.data.events ?? [];
        const registered = events.find((e) => e.eventAction === 'registration')?.eventDate ?? null;
        const expires = events.find((e) => e.eventAction === 'expiration')?.eventDate ?? null;
        const ageYears = registered ? Math.max(0, (Date.now() - Date.parse(registered)) / (365.25 * 24 * 3600 * 1000)) : null;
        return {
          registered,
          expires,
          registrar: registrarOf(rdapRes.data),
          ageYears: ageYears === null ? null : Math.round(ageYears * 10) / 10,
          status: rdapRes.data.status ?? [],
        };
      })()
    : null;

  const tranco = trancoRes.ok && trancoRes.data?.ranks?.length
    ? (() => {
        const history = trancoRes.data.ranks.slice(0, 40);
        return { rank: history[0]?.rank ?? null, date: history[0]?.date ?? null, history };
      })()
    : null;

  // Primera y última captura: CDX no da CORS, así que en el navegador queda sin datos.
  const [first, last] = await Promise.all([
    getJson<string[][]>(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp&sort=ascending&limit=1`, 6000),
    getJson<string[][]>(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp&sort=descending&limit=1`, 6000),
  ]);
  const firstTs = first.ok ? parseWaybackTimestamp(first.data?.[1]?.[0]) : null;
  const lastTs = last.ok ? parseWaybackTimestamp(last.data?.[1]?.[0]) : null;
  const closest = waybackRes.data?.archived_snapshots?.closest?.timestamp ?? null;

  return {
    domain,
    eligible: !platform,
    rdap,
    dns: {
      a,
      ns,
      mx,
      txt,
      spf: txt.some((t) => /v=spf1/i.test(t)),
      dmarc: dmarc.some((t) => /v=dmarc1/i.test(t)),
      verifications: txt
        .filter((t) => /google-site-verification|facebook-domain-verification|msvalidate\.01|p:domain_verify/i.test(t))
        .map((t) => t.split('=')[0]),
      hosting: a.length || ns.length ? 'detectado' : 'sin datos',
    },
    tranco,
    wayback: {
      first: firstTs,
      last: lastTs ?? parseWaybackTimestamp(closest ?? undefined),
      closest: parseWaybackTimestamp(closest ?? undefined),
    },
    sources,
    notes: [
      ...(platform ? ['El dominio raíz pertenece a la plataforma: RDAP y Tranco no describen tu sitio.'] : []),
      'Datos públicos y de solo lectura; no se envía nada del usuario.',
      'La popularidad (Tranco) y la antigüedad (RDAP) son contexto, no requisitos de AdSense.',
    ],
  };
}
