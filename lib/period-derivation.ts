// Uses string for documentId/companyId to be compatible with both
// Convex branded Id<"documents"> types and plain test strings.
// Convex IDs serialize to strings, so this works at runtime.
export interface StoredMetric {
  [key: string]: unknown;  // Allow _id, _creationTime, and other Convex fields to pass through
  documentId: string;
  companyId: string;
  period: string;
  category: string;
  metricName: string;
  value: number;
  unit: string;
  createdAt: number;
}

export interface DerivedMetric extends StoredMetric {
  source: "extracted" | "derived";
  derivation?: {
    formula: string;
    operands: { period: string; value: number; documentId: string }[];
  };
}

// Categories whose metrics are flow-based and can be subtracted
const SUBTRACTABLE_CATEGORIES = new Set(["resultat", "kontantstrøm"]);

// Metrics that are NOT subtractable even within subtractable categories
const NON_SUBTRACTABLE_METRICS = new Set(["resultat_per_aksje"]);

// Metrics that should never be negative (flags extraction errors upstream)
const NON_NEGATIVE_METRICS = new Set(["driftsinntekter"]);

// Derivation rules: [target standalone quarter, cumulative period, subtract period, formula label]
const DERIVATION_RULES: [string, string, string, string][] = [
  ["Q2", "H1", "Q1", "H1 - Q1"],
  ["Q3", "9M", "H1", "9M - H1"],
  ["Q4", "FY", "9M", "FY - 9M"],
];

// Map cumulative periods to the standalone quarter they end on.
// H1 balance sheet (30 Jun) = Q2 end-of-quarter snapshot, etc.
const CUMULATIVE_TO_QUARTER: Record<string, string> = {
  H1: "Q2",
  "9M": "Q3",
  FY: "Q4",
};

const MARGIN_RATIOS = [
  { name: "driftsmargin", numerator: "driftsresultat", denominator: "driftsinntekter" },
  { name: "ebitda_margin", numerator: "ebitda", denominator: "driftsinntekter" },
  { name: "netto_margin", numerator: "aarsresultat", denominator: "driftsinntekter" },
];

function isSubtractable(metric: StoredMetric): boolean {
  if (!SUBTRACTABLE_CATEGORIES.has(metric.category)) return false;
  if (NON_SUBTRACTABLE_METRICS.has(metric.metricName)) return false;
  return true;
}

function extractYear(period: string): string | null {
  const match = period.match(/^(\d{4})-/);
  return match ? match[1] : null;
}

export function deriveStandaloneQuarters(metrics: StoredMetric[]): DerivedMetric[] {
  // Tag all input metrics as extracted
  const result: DerivedMetric[] = metrics.map((m) => ({ ...m, source: "extracted" as const }));

  // Group by year
  const years = [...new Set(metrics.map((m) => extractYear(m.period)).filter(Boolean))] as string[];

  for (const year of years) {
    const yearMetrics = metrics.filter((m) => m.period.startsWith(year));

    // Get unique metric names that are subtractable
    const metricNames = [...new Set(
      yearMetrics.filter(isSubtractable).map((m) => m.metricName)
    )];

    for (const metricName of metricNames) {
      for (const [targetSuffix, cumSuffix, subSuffix, formula] of DERIVATION_RULES) {
        const targetPeriod = `${year}-${targetSuffix}`;

        // Skip if standalone already exists
        if (result.some((m) => m.period === targetPeriod && m.metricName === metricName)) continue;

        const cumMetric = yearMetrics.find((m) => m.period === `${year}-${cumSuffix}` && m.metricName === metricName);
        const subMetric = yearMetrics.find((m) => m.period === `${year}-${subSuffix}` && m.metricName === metricName);

        if (!cumMetric || !subMetric) continue;

        // Unit consistency check
        if (cumMetric.unit !== subMetric.unit) continue;

        const derivedValue = Math.round((cumMetric.value - subMetric.value) * 1000) / 1000;

        // Flag negative values for normally-positive metrics (likely extraction error)
        if (NON_NEGATIVE_METRICS.has(metricName) && derivedValue < 0) {
          console.warn(
            `DERIVATION WARNING: ${targetPeriod} ${metricName} = ${derivedValue} (negative). ` +
            `${cumSuffix}=${cumMetric.value} - ${subSuffix}=${subMetric.value}. Skipping.`
          );
          continue;
        }

        result.push({
          documentId: cumMetric.documentId,
          companyId: cumMetric.companyId,
          period: targetPeriod,
          category: cumMetric.category,
          metricName,
          value: derivedValue,
          unit: cumMetric.unit,
          createdAt: 0,
          source: "derived",
          derivation: {
            formula,
            operands: [
              { period: cumMetric.period, value: cumMetric.value, documentId: cumMetric.documentId },
              { period: subMetric.period, value: subMetric.value, documentId: subMetric.documentId },
            ],
          },
        });
      }
    }
  }

  // Remap non-subtractable metrics (balance sheet, EPS) from cumulative periods
  // to their corresponding standalone quarter. H1 balance sheet → Q2, etc.
  // Then remove the cumulative-period metrics so the dashboard only shows quarters.
  // Track derived quarter suffixes PER YEAR so we only hide cumulative periods
  // in years where derivation actually occurred.
  const derivedQuartersByYear = new Map<string, Set<string>>();
  for (const m of result) {
    if (m.source !== "derived") continue;
    const year = extractYear(m.period);
    const suffix = m.period.split("-")[1];
    if (!year) continue;
    if (!derivedQuartersByYear.has(year)) derivedQuartersByYear.set(year, new Set());
    derivedQuartersByYear.get(year)!.add(suffix);
  }

  for (const year of years) {
    const yearDerived = derivedQuartersByYear.get(year);
    if (!yearDerived) continue;

    for (const [cumSuffix, quarterSuffix] of Object.entries(CUMULATIVE_TO_QUARTER)) {
      const cumPeriod = `${year}-${cumSuffix}`;
      const quarterPeriod = `${year}-${quarterSuffix}`;

      // Only remap if we actually derived this quarter IN THIS YEAR
      if (!yearDerived.has(quarterSuffix)) continue;

      // Copy non-subtractable metrics from cumulative period to standalone quarter
      const cumNonFlow = result.filter(
        (m) => m.period === cumPeriod && !isSubtractable(m) && !NON_SUBTRACTABLE_METRICS.has(m.metricName)
      );
      for (const m of cumNonFlow) {
        // Don't overwrite if quarter already has this metric
        if (result.some((r) => r.period === quarterPeriod && r.metricName === m.metricName)) continue;
        result.push({ ...m, period: quarterPeriod });
      }
    }
  }

  // Remove cumulative-period metrics only in years where we derived the standalone quarter
  const cumulativePeriodsToHide = new Set<string>();
  for (const year of years) {
    const yearDerived = derivedQuartersByYear.get(year);
    if (!yearDerived) continue;
    for (const [cumSuffix, quarterSuffix] of Object.entries(CUMULATIVE_TO_QUARTER)) {
      if (yearDerived.has(quarterSuffix)) {
        cumulativePeriodsToHide.add(`${year}-${cumSuffix}`);
      }
    }
  }

  const filtered = result.filter((m) => !cumulativePeriodsToHide.has(m.period));

  // Recompute margins for derived quarters
  const derivedPeriods = [...new Set(
    filtered.filter((m) => m.source === "derived").map((m) => m.period)
  )];

  for (const period of derivedPeriods) {
    const periodMetrics = filtered.filter((m) => m.period === period);
    for (const ratio of MARGIN_RATIOS) {
      if (periodMetrics.some((m) => m.metricName === ratio.name)) continue;
      const num = periodMetrics.find((m) => m.metricName === ratio.numerator);
      const den = periodMetrics.find((m) => m.metricName === ratio.denominator);
      if (!num || !den || den.value === 0) continue;
      filtered.push({
        documentId: num.documentId,
        companyId: num.companyId,
        period,
        category: "nøkkeltall",
        metricName: ratio.name,
        value: Math.round((num.value / den.value) * 1000) / 10,
        unit: "%",
        createdAt: 0,
        source: "derived",
        derivation: {
          formula: `${ratio.numerator} / ${ratio.denominator}`,
          operands: [
            { period, value: num.value, documentId: num.documentId },
            { period, value: den.value, documentId: den.documentId },
          ],
        },
      });
    }
  }

  return filtered;
}
