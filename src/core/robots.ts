// Parser de robots.txt con la semantica de Google: grupo mas especifico gana,
// dentro del grupo la regla mas larga gana y Allow empata a favor del acceso.

export interface RobotsGroup {
  agents: string[];
  rules: { type: 'allow' | 'disallow'; path: string }[];
}

export interface RobotsFile {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** Lineas que no se pudieron interpretar (diagnostico). */
  badLines: number;
}

export function parseRobots(text: string): RobotsFile {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  let badLines = 0;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) {
      badLines++;
      continue;
    }
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      lastWasAgent = false;
      continue;
    }
    if (field === 'allow' || field === 'disallow') {
      if (!current) {
        badLines++;
        continue;
      }
      if (value === '') continue; // "Disallow:" vacio = permite todo
      current.rules.push({ type: field, path: value });
      lastWasAgent = false;
      continue;
    }
    lastWasAgent = false;
  }
  return { groups, sitemaps, badLines };
}

function ruleToRegex(path: string): RegExp {
  let p = path;
  let anchored = false;
  if (p.endsWith('$')) {
    anchored = true;
    p = p.slice(0, -1);
  }
  const escaped = p.split('*').map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/** Devuelve el grupo aplicable al user-agent dado (el mas especifico). */
export function groupFor(file: RobotsFile, ua: string): RobotsGroup | null {
  const needle = ua.toLowerCase();
  let best: { group: RobotsGroup; specificity: number } | null = null;
  for (const group of file.groups) {
    for (const agent of group.agents) {
      if (agent === '*') {
        if (!best) best = { group, specificity: 0 };
        continue;
      }
      if (agent && needle.includes(agent)) {
        const specificity = agent.length;
        if (!best || specificity > best.specificity) best = { group, specificity };
      }
    }
  }
  return best?.group ?? null;
}

export function isAllowed(file: RobotsFile, ua: string, path: string): boolean {
  const group = groupFor(file, ua);
  if (!group || group.rules.length === 0) return true;
  let bestLen = -1;
  let allowed = true;
  for (const rule of group.rules) {
    if (!ruleToRegex(rule.path).test(path)) continue;
    const len = rule.path.replace(/\$$/, '').length;
    if (len > bestLen || (len === bestLen && rule.type === 'allow')) {
      bestLen = len;
      allowed = rule.type === 'allow';
    }
  }
  return allowed;
}

/** Nombres de user-agent relevantes para AdSense (documentacion de Google). */
export const ADSENSE_CRAWLERS = ['Mediapartners-Google', 'AdsBot-Google'];
