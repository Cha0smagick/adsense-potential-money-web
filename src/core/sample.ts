// Muestreo reproducible para la estadistica. Semilla impresa en el informe:
// misma semilla + mismo sitemap = misma muestra. Sin dependencias.

/** PRNG xorshift32: rapido, determinista y suficiente para barajar. */
export function xorshift32(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function normalizePool(urls: string[], base: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    try {
      const url = new URL(raw, base);
      url.hash = '';
      const key = url.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    } catch {
      /* URL rota: fuera */
    }
  }
  return out;
}

/**
 * Muestra aleatoria uniforme sin reemplazo (Fisher-Yates parcial).
 * No modifica la entrada.
 */
export function sampleUrls(pool: string[], n: number, seed: number): string[] {
  const copy = pool.slice();
  const size = Math.max(0, Math.min(n, copy.length));
  const rand = xorshift32(seed);
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
