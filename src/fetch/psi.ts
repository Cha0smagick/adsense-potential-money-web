import type { PsiMetrics } from '../core/types.ts';

// PageSpeed Insights exige API key propia: la cuota anonima esta agotada de forma
// global (comprobado 2026-11-23). Sin key, el auditor marca rendimiento como unknown.

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runPsi(url: string, apiKey: string): Promise<{ metrics: PsiMetrics[]; error: string | null }> {
  if (!apiKey.trim()) return { metrics: [], error: null };

  const one = async (strategy: 'mobile' | 'desktop'): Promise<PsiMetrics | null> => {
    const params = new URLSearchParams({ url, strategy, key: apiKey.trim() });
    params.append('category', 'performance');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal });
      const data = (await res.json()) as {
        error?: { message?: string };
        lighthouseResult?: {
          categories?: Record<string, { score?: number }>;
          audits?: Record<string, { numericValue?: number }>;
        };
      };
      if (!res.ok || data.error || !data.lighthouseResult) return null;
      const audits = data.lighthouseResult.audits ?? {};
      const cat = data.lighthouseResult.categories ?? {};
      const num = (id: string) => (typeof audits[id]?.numericValue === 'number' ? (audits[id]!.numericValue as number) : null);
      const score = (id: string) => (typeof cat[id]?.score === 'number' ? (cat[id]!.score as number) * 100 : null);
      return {
        strategy,
        performance: score('performance'),
        seo: score('seo'),
        bestPractices: score('best-practices'),
        lcpMs: num('largest-contentful-paint'),
        cls: num('cumulative-layout-shift'),
        tbtMs: num('total-blocking-time'),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const [mobile, desktop] = await Promise.all([one('mobile'), one('desktop')]);
  const metrics = [mobile, desktop].filter((m): m is PsiMetrics => m !== null);
  return {
    metrics,
    error: metrics.length ? null : 'PageSpeed Insights no devolvió datos. Revisa la API key y la cuota.',
  };
}
