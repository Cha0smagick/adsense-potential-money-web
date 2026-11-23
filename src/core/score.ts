import type { Category, CategoryMeta, CategoryScore, GateResult, ScoreResult, SignalResult, Verdict } from './types.ts';
import type { RawSignal } from './signals.ts';

export const CATEGORY_META: CategoryMeta[] = [
  { id: 'content', label: 'Contenido y originalidad', weight: 30, why: 'Es la causa número uno de rechazo ("contenido de bajo valor").' },
  { id: 'policy', label: 'Cumplimiento de políticas', weight: 20, why: 'Una infracción de política impide la aprobación y puede suspender la cuenta.' },
  { id: 'essential', label: 'Páginas esenciales y confianza', weight: 15, why: 'La política de privacidad es requisito; el resto sostiene la credibilidad del editor.' },
  { id: 'ux', label: 'Navegación y experiencia', weight: 15, why: 'Sitios sin navegación o con capas intrusivas se leen como spam o abandono.' },
  { id: 'crawl', label: 'Rastreo técnico', weight: 10, why: 'Si Mediapartners-Google no puede entrar, no hay evaluación posible.' },
  { id: 'performance', label: 'Page experience', weight: 10, why: 'Velocidad y estabilidad afectan a la visualización real de los anuncios.' },
];

const GATE_DEFS: { id: string; label: string; cap: number; why: string; signals: string[] }[] = [
  {
    id: 'unreachable', label: 'Sin contenido accesible', cap: 15,
    why: 'No se obtuvo HTML con texto de la portada: no hay nada que Google pueda evaluar.',
    signals: ['content-reachable'],
  },
  {
    id: 'parked', label: 'Dominio aparcado o en construcción', cap: 15,
    why: 'Las páginas de parking o "coming soon" se rechazan automáticamente.',
    signals: ['policy-parked'],
  },
  {
    id: 'severe-policy', label: 'Infracción grave de políticas', cap: 20,
    why: 'Contenido ilegal o sexual explícito: la solicitud se rechaza y puede afectar a la cuenta.',
    signals: ['policy-adult', 'policy-illegal'],
  },
  {
    id: 'mediapartners', label: 'El rastreador de AdSense está bloqueado', cap: 40,
    why: 'Si Mediapartners-Google no puede leer el sitio, la revisión no llega a producirse.',
    signals: ['crawl-mediapartners'],
  },
  {
    id: 'thin', label: 'Contenido insuficiente en la portada', cap: 65,
    why: 'Menos de 300 palabras visibles: motivo típico de "contenido de bajo valor".',
    signals: ['content-words'],
  },
  {
    id: 'no-privacy', label: 'Sin política de privacidad verificada', cap: 70,
    why: 'AdSense exige informar del uso de cookies y publicidad personalizada.',
    signals: ['essential-privacy'],
  },
];

function valueOf(status: SignalResult['status']): number | null {
  if (status === 'pass') return 1;
  if (status === 'warn') return 0.5;
  if (status === 'fail') return 0;
  return null;
}

function categoryScores(signals: SignalResult[]): CategoryScore[] {
  return CATEGORY_META.map((meta) => {
    const own = signals.filter((s) => s.category === meta.id);
    let weighted = 0;
    let resolvedWeight = 0;
    let totalWeight = 0;
    for (const s of own) {
      totalWeight += s.weight;
      const v = valueOf(s.status);
      if (v === null) continue;
      weighted += v * s.weight;
      resolvedWeight += s.weight;
    }
    return {
      id: meta.id,
      label: meta.label,
      weight: meta.weight,
      score: resolvedWeight > 0 ? weighted / resolvedWeight : null,
      resolved: totalWeight > 0 ? resolvedWeight / totalWeight : 0,
      signals: own,
    };
  });
}

function computeTotal(signals: SignalResult[]): { score: number; confidence: number; caps: number[]; capBound: boolean } {
  const cats = categoryScores(signals);
  let sum = 0;
  let weightSum = 0;
  let resolvedWeight = 0;
  for (const c of cats) {
    if (c.score === null) continue;
    sum += c.score * c.weight;
    weightSum += c.weight;
    resolvedWeight += c.weight * c.resolved;
  }
  const raw = weightSum > 0 ? (sum / weightSum) * 100 : 0;
  const confidence = resolvedWeight / 100;

  const caps: number[] = [];
  for (const g of GATE_DEFS) {
    const hit = signals.some((s) => g.signals.includes(s.id) && s.status === 'fail');
    if (hit) caps.push(g.cap);
  }
  const cap = caps.length ? Math.min(...caps) : null;
  return {
    score: cap === null ? raw : Math.min(raw, cap),
    confidence,
    caps,
    capBound: cap !== null && raw > cap,
  };
}

function verdictOf(score: number): Verdict {
  if (score >= 85) {
    return {
      band: 'ready',
      label: 'Apto para solicitar AdSense',
      summary: 'Los fundamentos que evalúa Google están cubiertos. Solicita la revisión y corrige cualquier aviso antes de que llegue.',
      capApplied: null,
    };
  }
  if (score >= 70) {
    return {
      band: 'caveats',
      label: 'Apto con reservas',
      summary: 'El sitio es defendible, pero hay debilidades que un revisor humano puede convertir en rechazo. Corrige los puntos marcados antes de solicitar.',
      capApplied: null,
    };
  }
  if (score >= 50) {
    return {
      band: 'fix-first',
      label: 'Corrige antes de solicitar',
      summary: 'Una solicitud en este estado consume el intento y refuerza una impresión negativa. Arregla primero los bloqueadores y lo esencial.',
      capApplied: null,
    };
  }
  return {
    band: 'not-ready',
    label: 'No apto todavía',
    summary: 'Faltan los mínimos que Google exige: contenido real, páginas legales o acceso del rastreador. Solicitar ahora garantiza el rechazo.',
    capApplied: null,
  };
}

export function scoreSignals(raw: RawSignal[]): ScoreResult {
  // Orden estable por categoria y peso: el informe se lee de lo grave a lo leve.
  const signals: SignalResult[] = raw.map((s) => ({ ...s, impact: 0 }));

  const gates: GateResult[] = GATE_DEFS.map((g) => ({
    id: g.id,
    label: g.label,
    cap: g.cap,
    why: g.why,
    triggered: signals.some((s) => g.signals.includes(s.id) && s.status === 'fail'),
  }));

  const base = computeTotal(signals);
  const score = Math.round(base.score * 10) / 10;

  for (const s of signals) {
    const v = valueOf(s.status);
    if (v === null || v >= 1) {
      s.impact = 0;
      continue;
    }
    const flipped = signals.map((x) => (x.id === s.id ? { ...x, status: 'pass' as const } : x));
    const after = computeTotal(flipped);
    s.impact = Math.max(0, Math.round((after.score - base.score) * 10) / 10);
  }

  const verdict = verdictOf(score);
  const triggeredCaps = gates.filter((g) => g.triggered).map((g) => g.cap);
  verdict.capApplied = base.capBound && triggeredCaps.length ? Math.min(...triggeredCaps) : null;
  if (verdict.capApplied !== null) {
    verdict.summary = `${verdict.summary} Puntuación limitada por un bloqueador (tope ${verdict.capApplied}/100).`;
  }

  return {
    score,
    confidence: Math.round(base.confidence * 100) / 100,
    verdict,
    categories: categoryScores(signals),
    gates,
    signals,
    unknowns: signals.filter((s) => s.status === 'unknown').map((s) => s.label),
  };
}

export function categoryByStatus(cats: CategoryScore[]): Category[] {
  return cats.map((c) => c.id);
}
