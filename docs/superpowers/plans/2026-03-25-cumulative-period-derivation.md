# Cumulative Period Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the system to correctly handle IFRS cumulative reporting (Q1, H1, 9M, FY) by storing period scope metadata and deriving standalone quarterly figures at query time.

**Architecture:** Add `periodScope` to the documents table. Extend `lib/period-format.ts` with 9M canonicalization and chronological sorting. Add RULE 4 to the extraction prompt for period scope detection. Build a `lib/period-derivation.ts` module for deterministic query-time subtraction. Wire derivation into the Convex `getByCompany` query.

**Tech Stack:** TypeScript, Convex (schema + queries), Vitest (tests), Next.js (dashboard)

**Spec:** `docs/superpowers/specs/2026-03-25-cumulative-period-derivation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/period-format.ts` | Modify | Add 9M canonicalization, `periodToFileName` for 9M, chronological `sortPeriods` |
| `__tests__/period-format.test.ts` | Modify | Tests for 9M patterns, sort order |
| `lib/period-derivation.ts` | Create | Pure derivation logic: given a set of metrics, derive standalone quarters |
| `__tests__/period-derivation.test.ts` | Create | Thorough tests for derivation with all edge cases |
| `convex/schema.ts` | Modify | Add `periodScope` field to `documents` table |
| `lib/financial-extractor.ts` | Modify | Add RULE 4, `periodScope`/`periodEvidence` to prompt and types |
| `convex/financialMetrics.ts` | Modify | Wire derivation into `getByCompany` query |
| `app/api/upload/process/route.ts` | Modify | Pass `periodScope` through to document update |
| `lib/report-filters.ts` | Modify | Allow derived metrics (no `documentId`) through filters |
| `components/dashboard/overview-tab.tsx` | Modify | Show derived badge on derived metrics |

---

### Task 1: Extend period-format.ts with 9M support and chronological sorting

**Files:**
- Modify: `lib/period-format.ts`
- Modify: `__tests__/period-format.test.ts`

- [ ] **Step 1: Write failing tests for 9M canonicalization**

Add to `__tests__/period-format.test.ts`:

```typescript
it("parses nine-month formats", () => {
  expect(canonicalizePeriod("9M 2025")).toBe("2025-9M");
  expect(canonicalizePeriod("9m 2025")).toBe("2025-9M");
  expect(canonicalizePeriod("9M2025")).toBe("2025-9M");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: FAIL — "9M 2025" returns "9M 2025" (fallthrough) instead of "2025-9M"

- [ ] **Step 3: Implement 9M canonicalization**

In `lib/period-format.ts`, add before the `fyMatch` line:

```typescript
const nineMMatch = s.match(/9m\s*(\d{4})/);
if (nineMMatch) return `${nineMMatch[1]}-9M`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for 9M periodToFileName**

```typescript
it("converts nine-month periods", () => {
  expect(periodToFileName("2025-9M")).toBe("9M25");
  expect(periodToFileName("2024-9M")).toBe("9M24");
});

it("round-trips 9M through canonicalizePeriod", () => {
  expect(periodToFileName(canonicalizePeriod("9M 2025"))).toBe("9M25");
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: FAIL — `periodToFileName("2025-9M")` returns `null`

- [ ] **Step 7: Implement periodToFileName for 9M**

In `lib/period-format.ts`, add before `return null` in `periodToFileName`:

```typescript
const nmMatch = period.match(/^(\d{4})-9M$/);
if (nmMatch) return `9M${nmMatch[1].slice(2)}`;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: PASS

- [ ] **Step 9: Write failing tests for chronological sortPeriods**

```typescript
describe("sortPeriods", () => {
  it("sorts periods in chronological order", () => {
    const input = ["2025-FY", "2025-Q1", "2025-9M", "2025-H1", "2025-Q3"];
    expect(sortPeriods(input)).toEqual([
      "2025-Q1", "2025-H1", "2025-Q3", "2025-9M", "2025-FY",
    ]);
  });

  it("sorts across years", () => {
    const input = ["2025-Q1", "2024-FY", "2024-Q3", "2025-H1"];
    expect(sortPeriods(input)).toEqual([
      "2024-Q3", "2024-FY", "2025-Q1", "2025-H1",
    ]);
  });

  it("handles Q2 and Q4 in the order", () => {
    const input = ["2025-Q4", "2025-Q2", "2025-Q1", "2025-Q3"];
    expect(sortPeriods(input)).toEqual([
      "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4",
    ]);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: FAIL — current `sortPeriods` uses alphabetical sort, so "2025-9M" sorts before "2025-FY" but "2025-H1" sorts after "2025-Q1" incorrectly relative to cumulative ordering.

- [ ] **Step 11: Implement chronological sortPeriods**

Replace `sortPeriods` in `lib/period-format.ts`:

```typescript
const PERIOD_ORDER: Record<string, number> = {
  Q1: 1, Q2: 2, H1: 3, Q3: 4, "9M": 5, Q4: 6, H2: 7, FY: 8,
};

export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    const [yearA, suffA] = a.split("-");
    const [yearB, suffB] = b.split("-");
    if (yearA !== yearB) return yearA.localeCompare(yearB);
    return (PERIOD_ORDER[suffA] ?? 99) - (PERIOD_ORDER[suffB] ?? 99);
  });
}
```

- [ ] **Step 12: Run all period-format tests**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: ALL PASS

- [ ] **Step 13: Commit**

```bash
git add lib/period-format.ts __tests__/period-format.test.ts
git commit -m "feat: add 9M period support and chronological sort order"
```

---

### Task 2: Create period-derivation.ts with pure derivation logic

**Files:**
- Create: `lib/period-derivation.ts`
- Create: `__tests__/period-derivation.test.ts`

- [ ] **Step 1: Write failing tests for basic derivation**

Create `__tests__/period-derivation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveStandaloneQuarters, type StoredMetric } from "../lib/period-derivation";

function makeMetric(overrides: Partial<StoredMetric> & Pick<StoredMetric, "period" | "metricName" | "value">): StoredMetric {
  return {
    documentId: "doc_1",
    companyId: "comp_1",
    category: "resultat",
    unit: "MEUR",
    createdAt: 0,
    ...overrides,
  };
}

describe("deriveStandaloneQuarters", () => {
  it("derives Q2 from H1 and Q1", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    expect(q2).toBeDefined();
    expect(q2!.value).toBe(250);
    expect(q2!.source).toBe("derived");
    expect(q2!.derivation?.formula).toBe("H1 - Q1");
  });

  it("derives Q3 from 9M and H1", () => {
    const metrics = [
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 300 }),
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q3 = result.find((m) => m.period === "2025-Q3" && m.metricName === "driftsinntekter");
    expect(q3).toBeDefined();
    expect(q3!.value).toBe(150);
  });

  it("derives Q4 from FY and 9M", () => {
    const metrics = [
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450 }),
      makeMetric({ period: "2025-FY", metricName: "driftsinntekter", value: 600 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q4 = result.find((m) => m.period === "2025-Q4" && m.metricName === "driftsinntekter");
    expect(q4).toBeDefined();
    expect(q4!.value).toBe(150);
  });

  it("does NOT derive if standalone already exists", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
      makeMetric({ period: "2025-Q2", metricName: "driftsinntekter", value: 200 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    // Should not add a second Q2
    const q2s = result.filter((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    expect(q2s).toHaveLength(1);
    expect(q2s[0].source).toBe("extracted");
  });

  it("does NOT subtract balance sheet metrics", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "sum_eiendeler", value: 500, category: "balanse" }),
      makeMetric({ period: "2025-H1", metricName: "sum_eiendeler", value: 800, category: "balanse" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "sum_eiendeler");
    expect(q2).toBeUndefined();
  });

  it("does NOT subtract percentage metrics", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsmargin", value: 15, category: "nøkkeltall", unit: "%" }),
      makeMetric({ period: "2025-H1", metricName: "driftsmargin", value: 20, category: "nøkkeltall", unit: "%" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsmargin");
    expect(q2).toBeUndefined();
  });

  it("does NOT subtract EPS", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "resultat_per_aksje", value: 0.1 }),
      makeMetric({ period: "2025-H1", metricName: "resultat_per_aksje", value: 0.48 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "resultat_per_aksje");
    expect(q2).toBeUndefined();
  });

  it("returns null when prerequisite is missing", () => {
    const metrics = [
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 300 }),
      // Q1 missing — can't derive Q2
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2");
    expect(q2).toBeUndefined();
  });

  it("refuses to derive when units don't match", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100, unit: "MNOK" }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350, unit: "MEUR" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2");
    expect(q2).toBeUndefined();
  });

  it("handles full Cadeler-style derivation chain", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 82 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 299 }),
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 453 }),
      makeMetric({ period: "2025-FY", metricName: "driftsinntekter", value: 600 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    const q3 = result.find((m) => m.period === "2025-Q3" && m.metricName === "driftsinntekter");
    const q4 = result.find((m) => m.period === "2025-Q4" && m.metricName === "driftsinntekter");
    expect(q2!.value).toBe(217);
    expect(q3!.value).toBe(154);
    expect(q4!.value).toBe(147);
  });

  it("passes through extracted metrics unchanged", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q1 = result.find((m) => m.period === "2025-Q1");
    expect(q1!.source).toBe("extracted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/period-derivation.test.ts`
Expected: FAIL — module does not exist yet

- [ ] **Step 3: Implement period-derivation.ts**

Create `lib/period-derivation.ts`:

```typescript
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

// Derivation rules: [target standalone quarter, cumulative period, subtract period, formula label]
const DERIVATION_RULES: [string, string, string, string][] = [
  ["Q2", "H1", "Q1", "H1 - Q1"],
  ["Q3", "9M", "H1", "9M - H1"],
  ["Q4", "FY", "9M", "FY - 9M"],
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

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/period-derivation.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add lib/period-derivation.ts __tests__/period-derivation.test.ts
git commit -m "feat: add period derivation logic for cumulative reports"
```

---

### Task 3: Add periodScope to Convex schema and extraction

**Files:**
- Modify: `convex/schema.ts:15-31` — add `periodScope` field
- Modify: `lib/financial-extractor.ts:1-19,183-270,300-328` — add types, RULE 4, parse `periodScope`
- Modify: `app/api/upload/process/route.ts:185-208` — pass `periodScope` to document update

- [ ] **Step 1: Add periodScope to documents table**

In `convex/schema.ts`, add after line 22 (`period: v.string(),`):

```typescript
    periodScope: v.optional(v.string()),  // "standalone" | "cumulative"
    periodEvidence: v.optional(v.string()),
```

- [ ] **Step 2: Update ExtractionResult type**

In `lib/financial-extractor.ts`, update the `ExtractionResult` interface:

```typescript
export interface ExtractionResult {
  period: string;
  reportType: string;
  periodScope?: "standalone" | "cumulative";
  periodEvidence?: string;
  currency?: string;
  originalUnit?: string;
  unitEvidence?: string;
  metrics: ExtractedMetric[];
}
```

- [ ] **Step 3: Add RULE 4 to EXTRACTION_PROMPT**

In `lib/financial-extractor.ts`, add before the line `Returner et JSON-objekt med denne strukturen:` (before the JSON schema):

```
KRITISK REGEL 4 — PERIODETYPE-DETEKSJON (gjør dette FØR du leser av tall):
Bestem om rapporten presenterer FRITTSTÅENDE (standalone) eller KUMULATIVE tall:

Kumulative indikatorer: "H1", "1H", "first half", "six months", "første halvår", "9M", "nine months", "first nine months", "første ni måneder", "year ended", "full year", "FY", "helår"

Frittstående indikatorer: "Q1", "Q2", "Q3", "Q4", "first quarter", "second quarter", "third quarter", "fourth quarter", "1. kvartal", "2. kvartal", "3. kvartal", "4. kvartal", "three months ended [enkelt kvartal-datoperiode]"

Hvis rapporten har BÅDE en frittstående OG kumulativ kolonne for SAMME periode (f.eks. "Q3 2025" ved siden av "9M 2025"): hent KUN fra den frittstående kvartalskolonnen. Forveksle IKKE dette med kumulativ-vs-forrige-år (f.eks. "9M 2025" vs "9M 2024") — begge er kumulative, forskjellige år; hent fra inneværende år.

Du MÅ oppgi "periodEvidence" — eksakt tekst som beviser periodetypen.
```

- [ ] **Step 4: Update JSON schema in prompt**

Add `periodScope` and `periodEvidence` fields to the JSON template in the prompt:

```
  "periodScope": "<standalone|cumulative>",
  "periodEvidence": "<EKSAKT sitat fra kolonneoverskrift eller rapporttittel som viser periodetypen>",
```

- [ ] **Step 5: Parse periodScope in extractFinancialData**

In `lib/financial-extractor.ts`, in the `extractFinancialData` function after `const unitEvidence = ...`:

```typescript
  const periodScope = (parsed.periodScope === "cumulative" ? "cumulative" : "standalone") as "standalone" | "cumulative";
  const periodEvidence = parsed.periodEvidence || undefined;
```

And update the return to include them:

```typescript
  return {
    period,
    reportType,
    periodScope,
    periodEvidence,
    currency,
    originalUnit,
    unitEvidence,
    metrics: valid,
  };
```

- [ ] **Step 6: Pass periodScope through upload pipeline**

In `app/api/upload/process/route.ts`, update the `documents.updateStatus` call (~line 192) to include the new fields. Find the block:

```typescript
    await convex.mutation(api.documents.updateStatus, {
      id: docId,
      status: "ready",
      ...
    });
```

Add `periodScope` and `periodEvidence` to the args. This requires the `updateStatus` mutation in `convex/documents.ts` to accept these new optional fields — check and update if needed.

- [ ] **Step 7: Run the app and verify no regressions**

Run: `npx convex dev` (in one terminal) and `npm run dev` (in another)
Verify: App starts without schema errors

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts lib/financial-extractor.ts app/api/upload/process/route.ts
git commit -m "feat: add periodScope to schema and extraction prompt"
```

**Important:** Also add these args to `convex/documents.ts` `updateStatus` mutation (line 43-56). The current args validator does NOT include `periodScope` or `periodEvidence`. Add after `unitEvidence`:

```typescript
    periodScope: v.optional(v.string()),
    periodEvidence: v.optional(v.string()),
```

Without this, Convex will silently ignore the new fields. Include `convex/documents.ts` in the commit.

---

### Task 4: Wire derivation into dashboard via client-side hook

**Architecture note:** Convex queries can only import from the `convex/` directory. Since `period-derivation.ts` is a pure function with no Convex dependencies, we run it client-side after the Convex query returns. The existing derived margins (computed server-side in `getByCompany`) need to be recomputed for derived standalone quarters — the `deriveStandaloneQuarters` function should also compute margins for any derived quarter.

**Files:**
- Create: `lib/use-derived-metrics.ts`
- Modify: `lib/period-derivation.ts` — add margin recomputation for derived quarters
- Modify: `components/dashboard/report-filter-context.tsx:195-202`
- Modify: `lib/report-filters.ts:42-47`

- [ ] **Step 1: Add margin recomputation to period-derivation.ts**

After `deriveStandaloneQuarters` produces derived flow metrics, recompute margins for each derived period. Add at the end of the function, before `return result`:

```typescript
  // Recompute margins for derived quarters (server-side margin computation
  // in getByCompany only covers stored periods, not derived ones)
  const MARGIN_RATIOS = [
    { name: "driftsmargin", numerator: "driftsresultat", denominator: "driftsinntekter" },
    { name: "ebitda_margin", numerator: "ebitda", denominator: "driftsinntekter" },
    { name: "netto_margin", numerator: "aarsresultat", denominator: "driftsinntekter" },
  ];

  const derivedPeriods = [...new Set(
    result.filter((m) => m.source === "derived").map((m) => m.period)
  )];

  for (const period of derivedPeriods) {
    const periodMetrics = result.filter((m) => m.period === period);
    for (const ratio of MARGIN_RATIOS) {
      if (periodMetrics.some((m) => m.metricName === ratio.name)) continue;
      const num = periodMetrics.find((m) => m.metricName === ratio.numerator);
      const den = periodMetrics.find((m) => m.metricName === ratio.denominator);
      if (!num || !den || den.value === 0) continue;
      result.push({
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
```

Add a test for this:

```typescript
it("recomputes margins for derived quarters", () => {
  const metrics = [
    makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
    makeMetric({ period: "2025-Q1", metricName: "driftsresultat", value: 20 }),
    makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
    makeMetric({ period: "2025-H1", metricName: "driftsresultat", value: 80 }),
  ];
  const result = deriveStandaloneQuarters(metrics);
  const q2Margin = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsmargin");
  expect(q2Margin).toBeDefined();
  // Q2 revenue = 250, Q2 operating profit = 60, margin = 24%
  expect(q2Margin!.value).toBe(24);
  expect(q2Margin!.source).toBe("derived");
});
```

- [ ] **Step 2: Create the hook**

Create `lib/use-derived-metrics.ts`:

```typescript
import { useMemo } from "react";
import { deriveStandaloneQuarters, type StoredMetric } from "./period-derivation";

export function useDerivedMetrics(metrics: StoredMetric[] | undefined) {
  return useMemo(() => {
    if (!metrics) return undefined;
    return deriveStandaloneQuarters(metrics);
  }, [metrics]);
}
```

- [ ] **Step 3: Wire hook into report-filter-context**

In `components/dashboard/report-filter-context.tsx`, the derivation should be applied AFTER the Convex query returns but BEFORE filtering.

At line ~195, the current code is:

```typescript
const filteredMets = useMemo(() => {
  if (!metrics || !filteredDocs) return undefined;
  if (selectedTypes.length === 0 && selectedYears.length === 0) return metrics;
  ...
```

Insert the derivation step. Find where `metrics` is first available from the Convex query and apply `deriveStandaloneQuarters` to it. Then pass the enriched metrics into the filtering logic. Example:

```typescript
import { useDerivedMetrics } from "@/lib/use-derived-metrics";

// After metrics is fetched from Convex:
const enrichedMetrics = useDerivedMetrics(metrics as any);

// Then use enrichedMetrics instead of metrics in filteredMets:
const filteredMets = useMemo(() => {
  if (!enrichedMetrics || !filteredDocs) return undefined;
  if (selectedTypes.length === 0 && selectedYears.length === 0) return enrichedMetrics;
  ...
```

- [ ] **Step 4: Update filterMetricsByDocuments for derived metrics**

In `lib/report-filters.ts`, update `filterMetricsByDocuments` to check derived metrics against their source operand documents, not blindly pass all:

```typescript
export function filterMetricsByDocuments(
  metrics: { documentId: string; source?: string; derivation?: { operands: { documentId: string }[] } }[],
  filteredDocIds: Set<string>,
): typeof metrics {
  return metrics.filter((m) => {
    if (m.source === "derived" && m.derivation) {
      // Derived metrics pass through if ANY source document matches the filter
      return m.derivation.operands.some((op) => filteredDocIds.has(op.documentId));
    }
    return filteredDocIds.has(m.documentId);
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Test manually with existing data**

Upload a Cadeler Q1 and H1 report. Verify:
- Both periods appear in the dashboard
- Q2 is derived and shown with correct margins
- Dashboard doesn't error
- Year filter correctly includes/excludes derived metrics

- [ ] **Step 7: Commit**

```bash
git add lib/use-derived-metrics.ts lib/period-derivation.ts __tests__/period-derivation.test.ts lib/report-filters.ts components/dashboard/report-filter-context.tsx
git commit -m "feat: wire period derivation into dashboard with margin recomputation"
```

---

### Task 5: Dashboard display for derived metrics

**Files:**
- Modify: `components/dashboard/overview-tab.tsx`
- Modify: `components/dashboard/comparison-table.tsx` (if it shows per-period data)

- [ ] **Step 1: Update Metric interface to include source**

In `components/dashboard/overview-tab.tsx`, update the `Metric` interface:

```typescript
interface Metric {
  metricName: string;
  period: string;
  value: number;
  unit: string;
  source?: "extracted" | "derived";
  derivation?: {
    formula: string;
    operands: { period: string; value: number; documentId: string }[];
  };
}
```

- [ ] **Step 2: Add derived indicator to KPI cards**

When the latest metric is derived, show a small "(derived)" label. In the `formatValue` function, also return whether the metric is derived:

```typescript
const getLatestSource = (name: string) =>
  typedMetrics.find((m) => m.metricName === name && m.period === latestPeriod)?.source;
```

Pass this to `KpiCard` as an optional `derived` prop and show a subtle badge.

- [ ] **Step 3: Add tooltip to derived values in comparison table**

If `ComparisonTable` displays values per period, add a tooltip showing the derivation formula when hovering over derived values.

- [ ] **Step 4: Test visually**

Verify derived metrics show the indicator. Verify non-derived metrics don't show it.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/overview-tab.tsx components/dashboard/comparison-table.tsx components/dashboard/kpi-card.tsx
git commit -m "feat: show derived indicator on dashboard metrics"
```

---

### Task 6: Final integration test and cleanup

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Test with real Cadeler reports**

Upload the Q1, H1, and 9M Cadeler reports to the app. Verify:
1. Q1 shows as extracted
2. H1 is stored with `periodScope: "cumulative"`
3. Q2 is derived on the dashboard (H1 - Q1)
4. Q3 is derived on the dashboard (9M - H1)
5. Period sort order is correct: Q1, Q2, H1, Q3, 9M
6. Balance sheet metrics from H1 are NOT subtracted
7. Revenue chart shows correct standalone quarterly values

- [ ] **Step 3: Test with non-cumulative company**

Upload a Bouvet Q1 and Q2 report. Verify:
1. Both show as extracted
2. No derivation occurs (standalone quarters exist)
3. Dashboard works as before

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for cumulative period derivation"
```
