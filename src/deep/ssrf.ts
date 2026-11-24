import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Defensa SSRF para el motor profundo (GitHub Actions). El motor recibe una URL
// arbitraria: no basta con mirar el hostname, hay que resolver el DNS y bloquear
// direcciones privadas o link-local, y repetir la comprobación en cada redirección.

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const value = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) >>> 0 === (v4ToInt(base) & mask) >>> 0;
    });
  }
  if (version === 6) {
    const value = ip.toLowerCase();
    if (value === '::1' || value === '::') return true;
    if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('2001:db8')) return true;
    // IPv4 mapeada: ::ffff:127.0.0.1
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`URL no permitida (red interna): ${hostname}`);
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error(`URL no permitida (IP privada): ${host}`);
    return;
  }
  const addresses = await lookup(host, { all: true });
  if (!addresses.length) throw new Error(`No se pudo resolver ${hostname}.`);
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error(`URL no permitida (${hostname} resuelve a ${address}).`);
  }
}

/** fetch que valida cada salto de redirección. Devuelve la respuesta final. */
export async function safeFetch(target: string, init: RequestInit = {}, maxHops = 5): Promise<Response> {
  let current = target;
  for (let hop = 0; hop <= maxHops; hop++) {
    const url = new URL(current);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Protocolo no permitido: ${url.protocol}`);
    await assertPublicHost(url.hostname);
    const res = await fetch(url, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new Error('Demasiadas redirecciones.');
}
