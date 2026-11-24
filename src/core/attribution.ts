import type { AttributionResult, EconomicsResult, FixLink, GateResult, LossItem, LossMechanism, SignalResult } from './types.ts';
import { GATE_FIX, REMEDIATION } from './remediation.ts';

// Atribucion de la perdida economica. Solo convierte un defecto en dinero cuando existe
// un mecanismo demostrable. Si no lo hay, el defecto se queda en el plan como riesgo.

type Severity = 1 | 2 | 3 | 4 | 5;

interface Rule {
  mechanism: LossMechanism;
  severity: Severity;
  effort: Severity;
  hours: number;
  /** Para mechanism=factor: fraccion del ingreso que se conserva (0..1). */
  keep?: number;
  /** Para mechanism=risk: rango de fraccion del ingreso perdido. */
  risk?: [number, number];
  basis: string;
}

const GATE_EFFORT: Record<string, { effort: Severity; hours: number }> = {
  unreachable: { effort: 2, hours: 2 },
  parked: { effort: 4, hours: 24 },
  'severe-policy': { effort: 4, hours: 8 },
  mediapartners: { effort: 1, hours: 0.25 },
  thin: { effort: 4, hours: 16 },
  'no-privacy': { effort: 2, hours: 2 },
};

export interface AttributionInput {
  signals: SignalResult[];
  gates: GateResult[];
  economics: EconomicsResult;
  /** Factor de calidad por rendimiento (0.75..1). 1 = neutro. */
  pageQuality: number;
  mobileShare: number;
  /** false cuando el sitio no puede monetizar con AdSense tal como está. */
  canMonetize: boolean;
}

function ruleFor(id: string, input: AttributionInput): Rule | null {
  if (id === 'crawl-mediapartners' || id === 'crawl-noindex') {
    return { mechanism: 'binary', severity: 5, effort: 1, hours: 0.25, basis: 'Sin acceso del rastreador o con noindex no hay impresiones que monetizar.' };
  }
  if (id === 'policy-language') {
    return { mechanism: 'binary', severity: 5, effort: 4, hours: 8, basis: 'AdSense no sirve anuncios en idiomas no admitidos.' };
  }
  if (id === 'monetization-domain' && !input.canMonetize) {
    return { mechanism: 'binary', severity: 5, effort: 3, hours: 2, basis: 'Sin un dominio verificable, AdSense no puede aprobar el sitio tal como está.' };
  }
  if (id === 'perf-score' && input.pageQuality < 0.999) {
    return {
      mechanism: 'factor',
      severity: 3,
      effort: 3,
      hours: 4,
      keep: input.pageQuality,
      basis: `El modelo aplica un factor de rendimiento ×${input.pageQuality.toFixed(2)}: la velocidad afecta a la visualización real de los anuncios.`,
    };
  }
  if (id === 'ux-mobile') {
    return {
      mechanism: 'factor',
      severity: 4,
      effort: 1,
      hours: 1,
      keep: 1 - Math.min(0.8, input.mobileShare * 0.8),
      basis: `Sin viewport, el ${Math.round(input.mobileShare * 100)} % del tráfico móvil no puede usar el sitio ni ver los anuncios.`,
    };
  }
  if (id === 'content-thin-pages') {
    return { mechanism: 'risk', severity: 4, effort: 4, hours: 16, risk: [0.15, 0.4], basis: 'Páginas de bajo valor: riesgo de rechazo o suspensión (rango modelado, no medido).' };
  }
  if (id === 'content-duplicates') {
    return { mechanism: 'risk', severity: 3, effort: 4, hours: 12, risk: [0.1, 0.3], basis: 'Contenido duplicado: riesgo de rechazo por bajo valor.' };
  }
  if (id.startsWith('policy-') && id !== 'policy-ad-density') {
    return { mechanism: 'risk', severity: 4, effort: 3, hours: 4, risk: [0.1, 0.3], basis: 'Coincidencias sensibles: riesgo de rechazo o restricción de anuncios.' };
  }
  if (id === 'policy-ad-density') {
    return { mechanism: 'risk', severity: 4, effort: 2, hours: 1, risk: [0.15, 0.4], basis: 'Anuncios en pantallas sin contenido: motivo de suspensión, no solo de rechazo.' };
  }
  if (id === 'crawl-https') {
    return { mechanism: 'risk', severity: 3, effort: 2, hours: 2, risk: [0.05, 0.15], basis: 'Sin HTTPS muchos anunciantes no pujan: pérdida de RPM, no de acceso.' };
  }
  return null;
}

function itemFor(signal: SignalResult, rule: Rule, expected: number): LossItem {
  const fix: FixLink | null = signal.fix ?? REMEDIATION[signal.id] ?? null;
  if (rule.mechanism === 'binary') {
    return {
      id: signal.id,
      label: signal.label,
      mechanism: 'binary',
      monthlyLoss: { low: expected, base: expected, high: expected },
      severity: rule.severity,
      effort: rule.effort,
      hours: rule.hours,
      fix,
      basis: rule.basis,
    };
  }
  if (rule.mechanism === 'factor') {
    const lost = expected * (1 - (rule.keep ?? 1));
    return {
      id: signal.id,
      label: signal.label,
      mechanism: 'factor',
      monthlyLoss: { low: lost, base: lost, high: lost },
      severity: rule.severity,
      effort: rule.effort,
      hours: rule.hours,
      fix,
      basis: rule.basis,
    };
  }
  const [low, high] = rule.risk ?? [0, 0];
  return {
    id: signal.id,
    label: signal.label,
    mechanism: 'risk',
    monthlyLoss: { low: expected * low, base: expected * ((low + high) / 2), high: expected * high },
    severity: rule.severity,
    effort: rule.effort,
    hours: rule.hours,
    fix,
    basis: rule.basis,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function attributeLoss(input: AttributionInput): AttributionResult {
  const expected = Math.max(0, input.economics.expectedMonthly);
  const triggered = input.gates.filter((g) => g.triggered).sort((a, b) => a.cap - b.cap);
  const gate = triggered[0] ?? null;

  if (gate) {
    const effort = GATE_EFFORT[gate.id] ?? { effort: 3 as Severity, hours: 4 };
    const item: LossItem = {
      id: `gate-${gate.id}`,
      label: `Bloqueador: ${gate.label}`,
      mechanism: 'binary',
      monthlyLoss: { low: expected, base: expected, high: expected },
      severity: 5,
      effort: effort.effort,
      hours: effort.hours,
      fix: gate.fix ?? GATE_FIX[gate.id] ?? null,
      basis: gate.why,
    };
    return {
      items: [item],
      totals: { certain: round2(expected), measured: 0, expected: 0, all: round2(expected) },
      gateId: gate.id,
      subsumedByGate: true,
      narrative: [
        `El bloqueador «${gate.label}» explica la pérdida principal: mientras esté activo, el sitio no puede generar los ${expected.toFixed(0)} USD/mes esperados.`,
        'Los demás hallazgos no se suman a la pérdida hasta resolver este bloqueador.',
      ],
    };
  }

  const items: LossItem[] = [];
  for (const signal of input.signals) {
    if (signal.status !== 'fail' && signal.id !== 'monetization-domain') continue;
    const rule = ruleFor(signal.id, input);
    if (!rule) continue;
    items.push(itemFor(signal, rule, expected));
  }
  items.sort((a, b) => b.monthlyLoss.base - a.monthlyLoss.base);

  const sum = (m: LossMechanism) => items.filter((i) => i.mechanism === m).reduce((acc, i) => acc + i.monthlyLoss.base, 0);
  const certain = round2(sum('binary'));
  const measured = round2(sum('factor'));
  const expectedRisk = round2(sum('risk'));
  const all = round2(Math.min(expected, certain + measured + expectedRisk));

  const top = items.filter((i) => i.monthlyLoss.base > 0).slice(0, 3);
  const narrative: string[] = top.length
    ? top.map((i) => `${i.label}: ~${i.monthlyLoss.base.toFixed(0)} USD/mes (${i.mechanism === 'binary' ? 'pérdida cierta' : i.mechanism === 'factor' ? 'pérdida medida' : 'pérdida esperada por riesgo'}).`)
    : ['Sin pérdidas cuantificables: los defectos restantes no tienen un mecanismo demostrable de pérdida.'];
  narrative.push('Cifras condicionales al RPM y al tráfico declarados; los riesgos pueden solaparse y el total se acota al ingreso esperado.');

  return {
    items,
    totals: { certain, measured, expected: expectedRisk, all },
    gateId: null,
    subsumedByGate: false,
    narrative,
  };
}
