import { type ExtractedMetric } from "./financial-extractor";

export interface QualityScore {
  score: number;
  missing: string[];
  warnings: string[];
  usedStructuredPath: boolean;
  balanceSheetValid: boolean;
}

const CORE_METRICS = [
  "driftsinntekter",
  "driftsresultat",
  "ebitda",
  "aarsresultat",
  "sum_eiendeler",
  "egenkapital",
  "total_gjeld",
  "operasjonell_kontantstrom",
];

const METRIC_SIGNALS: { metric: string; signal: string }[] = [
  { metric: "driftsinntekter", signal: "revenue" },
  { metric: "driftsresultat", signal: "operating result" },
  { metric: "ebitda", signal: "ebitda" },
  { metric: "aarsresultat", signal: "profit" },
  { metric: "sum_eiendeler", signal: "total assets" },
  { metric: "egenkapital", signal: "total equity" },
  { metric: "total_gjeld", signal: "total liabilities" },
  { metric: "operasjonell_kontantstrom", signal: "operating activities" },
];

export function scoreExtraction(
  metrics: ExtractedMetric[],
  structuredInput: string,
  usedStructuredPath: boolean
): QualityScore {
  const warnings: string[] = [];
  const extractedNames = new Set(metrics.map((m) => m.metricName));
  let score = 0;

  // +10 per core metric found (max 80)
  for (const name of CORE_METRICS) {
    if (extractedNames.has(name)) score += 10;
  }

  // +10 for structured path
  if (usedStructuredPath) score += 10;

  // Balance sheet identity check
  const assets = metrics.find((m) => m.metricName === "sum_eiendeler");
  const equity = metrics.find((m) => m.metricName === "egenkapital");
  const debt = metrics.find((m) => m.metricName === "total_gjeld");
  let balanceSheetValid = true;

  if (assets && equity && debt && (equity.value + debt.value) !== 0) {
    const expected = equity.value + debt.value;
    const ratio = assets.value / expected;
    if (ratio > 1.2 || ratio < 0.8) {
      balanceSheetValid = false;
      if (ratio > 10 || ratio < 0.1) {
        score -= 20;
        warnings.push(`balance sheet 1000x off: assets=${assets.value}, equity+debt=${expected.toFixed(1)}`);
      } else {
        warnings.push(`balance sheet mismatch: assets=${assets.value}, equity+debt=${expected.toFixed(1)}`);
      }
    }
  }
  if (balanceSheetValid && assets && equity && debt) {
    score += 10;
  }

  // Detect missing metrics that appear in input
  const inputLower = structuredInput.toLowerCase();
  const missing: string[] = [];
  for (const { metric, signal } of METRIC_SIGNALS) {
    if (!extractedNames.has(metric) && inputLower.includes(signal)) {
      missing.push(metric);
      score -= 10;
    }
  }

  return { score, missing, warnings, usedStructuredPath, balanceSheetValid };
}
