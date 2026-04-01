# Structural Extraction Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 structural issues in the financial extraction pipeline: currency loss in table parser, narrow metric list, cross-table unit inheritance, missing sourceLabel, weak validation, and dead historical cross-check.

**Architecture:** Changes span the extraction pipeline bottom-up: table-parser → unit-resolver → structured-input → financial-extractor prompts/validation → quality-scorer → schema → route handler. Each task is a self-contained layer that builds on the previous.

**Tech Stack:** TypeScript, Convex (schema + mutations), OpenAI GPT-4o (prompts)

---

### Task 1: Add Currency Extraction to Table Parser

**Files:**
- Modify: `lib/table-parser.ts:1-52`

- [ ] **Step 1: Add `detectedCurrency` to `ParsedTable` interface**

In `lib/table-parser.ts`, update the interface and the `detectUnit` function:

```typescript
export interface ParsedTable {
  heading: string;
  headerRow: string[];
  rows: { label: string; values: string[] }[];
  rawText: string;
  lineNumber: number;
  unitIndicator: string | null;
  detectedUnit: "thousands" | "millions" | "billions" | "whole" | null;
  detectedCurrency: string | null;
}
```

- [ ] **Step 2: Add `detectCurrency` function**

Add this function above `detectUnit` in `lib/table-parser.ts`:

```typescript
const CURRENCY_PATTERNS: [RegExp, string][] = [
  [/\bNOK\b/i, "NOK"], [/\bMNOK\b/i, "NOK"], [/\bTNOK\b/i, "NOK"], [/\bBNOK\b/i, "NOK"],
  [/\(NOKm?\)/i, "NOK"], [/\(NOKbn\)/i, "NOK"], [/\bmill\.\s*(?:kr|NOK)/i, "NOK"],
  [/\bmKR\b/i, "NOK"], [/\bTkr\b/i, "NOK"], [/\bMkr\b/i, "NOK"],
  [/NOK\s*1\s*000/i, "NOK"], [/\bkroner\b/i, "NOK"],
  [/\bEUR\b/i, "EUR"], [/\bMEUR\b/i, "EUR"], [/\bTEUR\b/i, "EUR"], [/\bBEUR\b/i, "EUR"],
  [/\(EURm?\)/i, "EUR"], [/\bmill\.\s*EUR/i, "EUR"], [/[TM]€/, "EUR"],
  [/\bUSD\b/i, "USD"], [/\bMUSD\b/i, "USD"], [/\bTUSD\b/i, "USD"], [/\bBUSD\b/i, "USD"],
  [/\(USDm?\)/i, "USD"], [/\bmill\.\s*USD/i, "USD"], [/[TM]\$/, "USD"],
  [/\bSEK\b/i, "SEK"], [/\bMSEK\b/i, "SEK"], [/\bTSEK\b/i, "SEK"], [/\bBSEK\b/i, "SEK"],
  [/\bDKK\b/i, "DKK"], [/\bMDKK\b/i, "DKK"], [/\bTDKK\b/i, "DKK"],
  [/\bGBP\b/i, "GBP"], [/\bMGBP\b/i, "GBP"], [/\bTGBP\b/i, "GBP"],
];

function detectCurrency(text: string): string | null {
  for (const [pat, currency] of CURRENCY_PATTERNS) {
    if (pat.test(text)) return currency;
  }
  return null;
}
```

- [ ] **Step 3: Wire currency detection into table parsing**

In `parseMarkdownTables`, after the existing `detectUnit` calls (around line 127-132), add currency detection using the same `headerText` and fallback to row labels:

```typescript
      const heading = findHeading(lines, tableStartLine);
      const headerText = headerCells.join(" ") + " " + heading;
      let { indicator, unit } = detectUnit(headerText);
      let currency = detectCurrency(headerText);

      if (!indicator) {
        const allLabels = rows.map((r) => r.label).join(" ");
        ({ indicator, unit } = detectUnit(allLabels));
      }

      if (!currency) {
        const allLabels = rows.map((r) => r.label).join(" ");
        currency = detectCurrency(allLabels);
      }

      tables.push({
        heading,
        headerRow: headerCells,
        rows,
        rawText: rawLines.join("\n"),
        lineNumber: tableStartLine + 1,
        unitIndicator: indicator,
        detectedUnit: unit,
        detectedCurrency: currency,
      });
```

- [ ] **Step 4: Verify build passes**

Run: `npx tsc --noEmit`
Expected: Type errors in `unit-resolver.ts` and `structured-input.ts` (they don't use currency yet — that's fine, handled in Task 2)

- [ ] **Step 5: Commit**

```bash
git add lib/table-parser.ts
git commit -m "feat: extract currency from table headers alongside unit detection"
```

---

### Task 2: Per-Table Unit Resolution + Currency Pass-Through

**Files:**
- Modify: `lib/unit-resolver.ts`
- Modify: `lib/structured-input.ts`

- [ ] **Step 1: Update `ResolvedTable` and `resolveUnits` in `lib/unit-resolver.ts`**

Replace the entire file:

```typescript
import { type ParsedTable } from "./table-parser";
import { type TableClass } from "./table-classifier";

interface ClassifiedTable {
  table: ParsedTable;
  classification: TableClass;
}

export interface ResolvedTable extends ClassifiedTable {
  resolvedUnit: ParsedTable["detectedUnit"];
  resolvedCurrency: string | null;
  unitContext: string;
}

const UNIT_CONTEXT: Record<string, string> = {
  thousands: "Values are in thousands — divide by 1000 to get millions.",
  millions: "Values are already in millions. Use as-is.",
  billions: "Values are in billions — multiply by 1000 to get millions.",
  whole: "Values are in whole currency units — divide by 1000000 to get millions.",
};

export function resolveUnits(tables: ClassifiedTable[]): ResolvedTable[] {
  const financialTypes: TableClass[] = ["income_statement", "balance_sheet", "cash_flow"];

  const resolved = tables.map((ct) => {
    const resolvedUnit = ct.table.detectedUnit;
    const resolvedCurrency = ct.table.detectedCurrency ?? null;
    const currencyLabel = resolvedCurrency ? ` ${resolvedCurrency}` : "";
    const unitContext = resolvedUnit
      ? `${UNIT_CONTEXT[resolvedUnit]}${currencyLabel ? ` Currency:${currencyLabel}.` : ""}`
      : "No unit detected. Infer from value magnitudes.";

    return { ...ct, resolvedUnit, resolvedCurrency, unitContext };
  });

  // Consistency warning: check if financial tables disagree on unit or currency
  const financialTables = resolved.filter((t) => financialTypes.includes(t.classification));
  const explicitUnits = financialTables.filter((t) => t.resolvedUnit).map((t) => t.resolvedUnit);
  const explicitCurrencies = financialTables.filter((t) => t.resolvedCurrency).map((t) => t.resolvedCurrency);

  if (new Set(explicitUnits).size > 1) {
    console.warn(
      `[unit-resolver] Conflicting units across financial tables: ${[...new Set(explicitUnits)].join(", ")}`
    );
  }
  if (new Set(explicitCurrencies).size > 1) {
    console.warn(
      `[unit-resolver] Conflicting currencies across financial tables: ${[...new Set(explicitCurrencies)].join(", ")}`
    );
  }

  return resolved;
}
```

- [ ] **Step 2: Update `buildStructuredInput` in `lib/structured-input.ts` to include currency**

Replace the entire file:

```typescript
import { type ResolvedTable } from "./unit-resolver";

const LABEL_MAP: Record<string, string> = {
  income_statement: "INCOME STATEMENT",
  balance_sheet: "BALANCE SHEET",
  cash_flow: "CASH FLOW",
};

const FINANCIAL_TYPES = new Set(["income_statement", "balance_sheet", "cash_flow"]);

export function buildStructuredInput(tables: ResolvedTable[]): string {
  const financialTables = tables.filter((t) => FINANCIAL_TYPES.has(t.classification));
  if (financialTables.length === 0) return "";

  const sections: string[] = [];

  for (const rt of financialTables) {
    const label = LABEL_MAP[rt.classification] ?? rt.classification.toUpperCase();
    const columns = rt.table.headerRow.slice(1).join(" | ");
    const unitLine = rt.unitContext ? ` (${rt.unitContext})` : "";

    const lines: string[] = [];
    lines.push(`${label}${unitLine}`);
    if (columns) lines.push(`Columns: ${columns}`);

    for (const row of rt.table.rows) {
      if (row.label) {
        lines.push(`|${row.label}|${row.values.join("|")}|`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
```

- [ ] **Step 3: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add lib/unit-resolver.ts lib/structured-input.ts
git commit -m "feat: per-table unit/currency resolution with consistency warnings"
```

---

### Task 3: Expand IFRS Metric Taxonomy in Prompts

**Files:**
- Modify: `lib/financial-extractor.ts:271-414` (both prompts)

- [ ] **Step 1: Replace `EXTRACTION_PROMPT` OPPGAVE 2 section**

In `lib/financial-extractor.ts`, replace lines 288-307 (the `OPPGAVE 2` metric list and mapping) with the expanded IFRS taxonomy. The full replacement for lines 288-308:

```
OPPGAVE 2 — STANDARDISER METRIKKNAVNENE:
Bruk KUN disse navnene:
- resultat: driftsinntekter, varekostnad, bruttofortjeneste, personalkostnader, andre_driftskostnader, avskrivninger, nedskrivninger, driftsresultat, ebitda, finansinntekter, finanskostnader, resultat_for_skatt, skattekostnad, aarsresultat, resultat_per_aksje
- balanse: goodwill, immaterielle_eiendeler, varige_driftsmidler, bruksrettseiendeler, andre_anleggsmidler, varer, kundefordringer, kontanter, sum_eiendeler, egenkapital, rentebærende_gjeld, annen_gjeld, total_gjeld
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad, egenkapitalandel

Kartlegging:
- Revenue / Total revenue / Omsetning / Driftsinntekter / Net sales → "driftsinntekter"
- Cost of goods sold / COGS / Raw materials / Varekostnad / Cost of sales → "varekostnad"
- Gross profit / Bruttofortjeneste → "bruttofortjeneste"
- Employee benefits / Personnel expenses / Lønnskostnader / Personalkostnader → "personalkostnader"
- Other operating expenses / Andre driftskostnader / Other OpEx → "andre_driftskostnader"
- Depreciation & amortisation / D&A / Avskrivninger (excl. impairment) → "avskrivninger"
- Impairment loss / Goodwill impairment / Write-down / Nedskrivning → "nedskrivninger"
- Operating profit / EBIT / Operating result / Driftsresultat → "driftsresultat"
- EBITDA / EBITDAR → "ebitda"
- Finance income / Interest income / Finansinntekter → "finansinntekter"
- Finance expense / Finance costs / Interest expense / Finanskostnader → "finanskostnader"
- Profit before tax / Resultat før skatt / EBT → "resultat_for_skatt"
- Income tax expense / Tax / Skattekostnad → "skattekostnad"
- Profit / Net income / Årsresultat → "aarsresultat"
- Earnings per share / Basic EPS / Resultat per aksje → "resultat_per_aksje"
- Goodwill → "goodwill"
- Intangible assets / Immaterielle eiendeler → "immaterielle_eiendeler"
- Property plant & equipment / PP&E / Varige driftsmidler → "varige_driftsmidler"
- Right-of-use assets / Bruksrettseiendeler / ROU assets → "bruksrettseiendeler"
- Other non-current assets / Andre anleggsmidler / Investments → "andre_anleggsmidler"
- Inventories / Varelager / Varer → "varer"
- Trade receivables / Accounts receivable / Kundefordringer → "kundefordringer"
- Cash / Cash and cash equivalents / Kontanter / Bankinnskudd → "kontanter"
- Total assets / Sum eiendeler → "sum_eiendeler"
- Total equity / Egenkapital / Shareholders' equity → "egenkapital"
- Interest-bearing debt / Rentebærende gjeld / Financial liabilities → "rentebærende_gjeld"
- Other liabilities / Trade payables / Annen gjeld / Non-interest-bearing → "annen_gjeld"
- Total liabilities / Total gjeld / Sum gjeld → "total_gjeld"
- Cash from operating activities → "operasjonell_kontantstrom"
- Cash from investing activities → "investeringsaktiviteter"
- Cash from financing activities → "finansieringsaktiviteter"
- Free cash flow / FCF → "fri_kontantstrom"
- Net change in cash / Netto endring kontanter → "netto_endring_kontanter"
```

- [ ] **Step 2: Add `sourceLabel` to the JSON output format in `EXTRACTION_PROMPT`**

Replace the metrics JSON schema in the prompt (lines 327-334) with:

```
  "metrics": [
    {
      "metricName": "<standardisert navn>",
      "sourceLabel": "<EKSAKT label fra kildetabellen, f.eks. 'Raw materials and consumables used'>",
      "value": <numerisk verdi i millioner>,
      "unit": "<MNOK|MEUR|MUSD|MSEK|MDKK|MGBP|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
```

- [ ] **Step 3: Update `OPPGAVE 4` to use detected currency**

Replace the `OPPGAVE 4` section (lines 315-316) with:

```
OPPGAVE 4 — BEKREFT VALUTA:
Valutaen er allerede detektert fra tabelloverskriftene og oppgitt i enhetskonteksten ovenfor. Bruk denne. Hvis enhetskonteksten ikke inneholder valuta, se etter valutaindikatorer i tabellene (NOK, EUR, USD, SEK, etc.).
```

- [ ] **Step 4: Apply same changes to `FALLBACK_EXTRACTION_PROMPT`**

Update `FALLBACK_EXTRACTION_PROMPT` (lines 340-414) with the same expanded metric list in its `OPPGAVE 3` section (lines 359-381), and add `sourceLabel` to its JSON output format (lines 403-410). The mapping section should be:

```
OPPGAVE 3 — STANDARDISER METRIKKNAVNENE:
Bruk KUN disse navnene:
- resultat: driftsinntekter, varekostnad, bruttofortjeneste, personalkostnader, andre_driftskostnader, avskrivninger, nedskrivninger, driftsresultat, ebitda, finansinntekter, finanskostnader, resultat_for_skatt, skattekostnad, aarsresultat, resultat_per_aksje
- balanse: goodwill, immaterielle_eiendeler, varige_driftsmidler, bruksrettseiendeler, andre_anleggsmidler, varer, kundefordringer, kontanter, sum_eiendeler, egenkapital, rentebærende_gjeld, annen_gjeld, total_gjeld
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad, egenkapitalandel

Kartlegging:
- Revenue / Total revenue / Operating revenues → "driftsinntekter"
- Cost of goods sold / COGS / Raw materials → "varekostnad"
- Gross profit / Bruttofortjeneste → "bruttofortjeneste"
- Employee benefits / Personnel expenses / Lønnskostnader → "personalkostnader"
- Other operating expenses / Andre driftskostnader → "andre_driftskostnader"
- Depreciation & amortisation / D&A / Avskrivninger → "avskrivninger"
- Impairment loss / Goodwill impairment / Write-down / Nedskrivning → "nedskrivninger"
- Operating profit / EBIT / Operating result / Operating profit / loss → "driftsresultat"
- Gross operating profit / EBITDA → "ebitda"
- Finance income / Interest income / Finansinntekter → "finansinntekter"
- Finance expense / Finance costs / Interest expense / Finanskostnader → "finanskostnader"
- Profit before tax / Profit / loss before taxes → "resultat_for_skatt" (bruk TOTAL, inkludert discontinued operations)
- Income tax expense / Tax / Skattekostnad → "skattekostnad"
- Profit / loss / Net income / Profit for the period → "aarsresultat" (bruk TOTAL Profit/loss, IKKE bare "from continuing operations")
- Earnings per share / Basic EPS → "resultat_per_aksje" (bruk TOTAL, ikke bare continuing operations)
- Goodwill → "goodwill"
- Intangible assets / Immaterielle eiendeler → "immaterielle_eiendeler"
- Property plant & equipment / PP&E / Varige driftsmidler → "varige_driftsmidler"
- Right-of-use assets / Bruksrettseiendeler → "bruksrettseiendeler"
- Other non-current assets / Andre anleggsmidler → "andre_anleggsmidler"
- Inventories / Varelager → "varer"
- Trade receivables / Accounts receivable / Kundefordringer → "kundefordringer"
- Cash / Cash and cash equivalents / Kontanter → "kontanter"
- Total assets / Sum eiendeler → "sum_eiendeler"
- Equity / Total equity / Equity attributable to owners → "egenkapital" (bruk TOTAL equity inkl. non-controlling interests)
- Interest-bearing debt / Rentebærende gjeld / Financial liabilities → "rentebærende_gjeld"
- Other liabilities / Trade payables / Annen gjeld → "annen_gjeld"
- Total liabilities → "total_gjeld" (beregn som Total assets - Equity hvis ikke oppgitt direkte)
- Net cash flow from operating activities → "operasjonell_kontantstrom" (bruk TOTAL, ikke bare continuing operations)
- Net cash flow from investing activities → "investeringsaktiviteter" (bruk TOTAL)
- Net cash flow from financing activities → "finansieringsaktiviteter" (bruk TOTAL)
- Free cash flow / FCF → "fri_kontantstrom"
- Net increase / decrease in cash → "netto_endring_kontanter"
```

And the JSON output with `sourceLabel`:

```
  "metrics": [
    {
      "metricName": "<standardisert navn>",
      "sourceLabel": "<EKSAKT label fra kildeteksten>",
      "value": <numerisk verdi i millioner>,
      "unit": "<MNOK|MEUR|MUSD|MSEK|MDKK|MGBP|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
```

- [ ] **Step 5: Update `ExtractedMetric` interface to include `sourceLabel`**

In `lib/financial-extractor.ts`, update the interface (lines 7-14):

```typescript
export interface ExtractedMetric {
  metricName: string;
  sourceLabel?: string;
  value: number;
  unit: string;
  category: string;
  confidence: "high" | "medium" | "low";
  flagged?: boolean;
}
```

- [ ] **Step 6: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/financial-extractor.ts
git commit -m "feat: expand to full IFRS metric taxonomy with sourceLabel"
```

---

### Task 4: Expand Validation Rules

**Files:**
- Modify: `lib/financial-extractor.ts:32-163` (validation functions)

- [ ] **Step 1: Expand `NON_NEGATIVE_METRICS`**

Replace line 32-34 in `lib/financial-extractor.ts`:

```typescript
const NON_NEGATIVE_METRICS = [
  "driftsinntekter", "sum_eiendeler", "kontanter", "goodwill",
  "varige_driftsmidler", "immaterielle_eiendeler", "varer", "kundefordringer",
];
```

- [ ] **Step 2: Add cross-metric and range validation to `validateMetrics`**

Replace the `validateMetrics` function (lines 137-163):

```typescript
export function validateMetrics(metrics: ExtractedMetric[]): ValidationResult {
  const fixed = fixBalanceSheetMagnitude(metrics);

  const valid: ExtractedMetric[] = [];
  const rejected: { metric: ExtractedMetric; reason: string }[] = [];

  // Build lookup for cross-metric checks
  const byName = new Map<string, ExtractedMetric>();
  for (const m of fixed) byName.set(m.metricName, m);

  for (const metric of fixed) {
    // Percentage range: reject if |value| > 200
    if (metric.unit === "%" && Math.abs(metric.value) > 200) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value}% exceeds ±200%` });
      continue;
    }

    // Non-negative check
    if (NON_NEGATIVE_METRICS.includes(metric.metricName) && metric.value < 0) {
      rejected.push({ metric, reason: `${metric.metricName}: unexpected negative value ${metric.value}` });
      continue;
    }

    // Ratio range: gjeldsgrad should not exceed 100x
    if (metric.metricName === "gjeldsgrad" && (metric.value > 100 || metric.value < -10)) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value} outside valid range` });
      continue;
    }

    // EPS sanity: reject if |value| > 10000 (likely unit error)
    if (metric.metricName === "resultat_per_aksje" && Math.abs(metric.value) > 10000) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value} likely unit error` });
      continue;
    }

    // Cross-metric: operating profit should not exceed revenue
    if (metric.metricName === "driftsresultat") {
      const revenue = byName.get("driftsinntekter");
      if (revenue && revenue.unit !== "%" && metric.unit !== "%" && Math.abs(metric.value) > Math.abs(revenue.value) * 1.05) {
        rejected.push({ metric, reason: `driftsresultat (${metric.value}) exceeds driftsinntekter (${revenue.value})` });
        continue;
      }
    }

    // Cross-metric: gross profit should not exceed revenue
    if (metric.metricName === "bruttofortjeneste") {
      const revenue = byName.get("driftsinntekter");
      if (revenue && revenue.unit !== "%" && metric.unit !== "%" && metric.value > revenue.value * 1.05) {
        rejected.push({ metric, reason: `bruttofortjeneste (${metric.value}) exceeds driftsinntekter (${revenue.value})` });
        continue;
      }
    }

    if (metric.confidence === "low") {
      valid.push({ ...metric, flagged: true });
    } else {
      valid.push(metric);
    }
  }

  return { valid, rejected };
}
```

- [ ] **Step 3: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/financial-extractor.ts
git commit -m "feat: expanded validation with range checks and cross-metric sanity"
```

---

### Task 5: Expand Quality Scorer

**Files:**
- Modify: `lib/quality-scorer.ts`

- [ ] **Step 1: Expand `CORE_METRICS` and `METRIC_SIGNALS`**

Replace the entire `CORE_METRICS` and `METRIC_SIGNALS` arrays in `lib/quality-scorer.ts` (lines 11-31):

```typescript
const CORE_METRICS = [
  "driftsinntekter",
  "varekostnad",
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
  { metric: "varekostnad", signal: "cost of goods" },
  { metric: "driftsresultat", signal: "operating result" },
  { metric: "ebitda", signal: "ebitda" },
  { metric: "aarsresultat", signal: "profit" },
  { metric: "sum_eiendeler", signal: "total assets" },
  { metric: "egenkapital", signal: "total equity" },
  { metric: "total_gjeld", signal: "total liabilities" },
  { metric: "operasjonell_kontantstrom", signal: "operating activities" },
];
```

Note: `varekostnad` added to core metrics. Additional signal patterns added for `varekostnad`. Score calculation stays the same — +10 per core metric, max is now 90 base.

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/quality-scorer.ts
git commit -m "feat: add varekostnad to core metrics in quality scorer"
```

---

### Task 6: Add `sourceLabel` to Schema and Mutations

**Files:**
- Modify: `convex/schema.ts:62-74`
- Modify: `convex/financialMetrics.ts:5-39`
- Modify: `app/api/upload/process/route.ts:170-182`

- [ ] **Step 1: Add `sourceLabel` to `financialMetrics` schema**

In `convex/schema.ts`, update the `financialMetrics` table definition (line 62-74):

```typescript
  financialMetrics: defineTable({
    documentId: v.id("documents"),
    companyId: v.id("companies"),
    period: v.string(),
    category: v.string(),
    metricName: v.string(),
    value: v.number(),
    unit: v.string(),
    sourceLabel: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_company", ["companyId"])
    .index("by_company_metric", ["companyId", "metricName"]),
```

- [ ] **Step 2: Add `sourceLabel` to `insertBatch` mutation args**

In `convex/financialMetrics.ts`, update the `insertBatch` args schema (lines 7-15):

```typescript
    metrics: v.array(v.object({
      documentId: v.id("documents"),
      companyId: v.id("companies"),
      period: v.string(),
      category: v.string(),
      metricName: v.string(),
      value: v.number(),
      unit: v.string(),
      sourceLabel: v.optional(v.string()),
    })),
```

- [ ] **Step 3: Pass `sourceLabel` from route handler**

In `app/api/upload/process/route.ts`, update the metric mapping in the `insertBatch` call (lines 172-181):

```typescript
    await convex.mutation(api.financialMetrics.insertBatch, {
      metrics: extractionResult.metrics.map((m) => ({
        documentId: docId,
        companyId,
        period: extractionResult.period,
        category: m.category,
        metricName: m.metricName,
        value: m.value,
        unit: m.unit,
        sourceLabel: m.sourceLabel,
      })),
    });
```

- [ ] **Step 4: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Push schema to Convex dev**

Run: `npx convex dev --once`
Expected: Schema pushed, `financialMetrics` table updated with new `sourceLabel` field

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/financialMetrics.ts app/api/upload/process/route.ts
git commit -m "feat: add sourceLabel to financialMetrics for IFRS audit trail"
```

---

### Task 7: Wire Up Historical Cross-Check

**Files:**
- Modify: `app/api/upload/process/route.ts:114-167`

- [ ] **Step 1: Expand magnitude check to cover revenue, total assets, and equity**

In `app/api/upload/process/route.ts`, replace the magnitude check section (lines 136-167) with:

```typescript
  // 9. Cross-period magnitude check (revenue + total assets + equity)
  let normalizationWarning: string | undefined;
  const magnitudeMetrics = ["driftsinntekter", "sum_eiendeler", "egenkapital"];
  const warnings: string[] = [];

  for (const metricName of magnitudeMetrics) {
    const newMetric = extractionResult.metrics.find((m) => m.metricName === metricName);
    if (!newMetric) continue;
    try {
      const existing = await convex.query(
        api.financialMetrics.getByCompanyAndMetric,
        { companyId, metricName }
      );
      if (existing.length > 0) {
        const latest = existing.sort((a, b) => b.period.localeCompare(a.period))[0];
        if (latest.value !== 0) {
          const ratio = newMetric.value / latest.value;
          if (ratio > 10 || ratio < 0.1) {
            const msg =
              `${metricName}: ${extractionResult.period} (${newMetric.value} ${newMetric.unit}) ` +
              `er ${ratio.toFixed(1)}x av ${latest.period} (${latest.value} ${latest.unit})`;
            warnings.push(msg);
            console.warn(`MAGNITUDE CHECK FAILED: ${msg}`);
          }
        }
      }
    } catch (e) {
      console.warn(`Magnitude check error for ${metricName}:`, e);
    }
  }

  if (warnings.length > 0) {
    normalizationWarning =
      `Mulig enhetsfeil. Detektert originalUnit: "${extractionResult.originalUnit ?? "ukjent"}". ` +
      `Bevis: "${extractionResult.unitEvidence ?? "ingen"}". ` +
      warnings.join("; ");
  }
```

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/process/route.ts
git commit -m "feat: expand magnitude cross-check to revenue, assets, and equity"
```

---

### Task 8: Update `checkCompleteness` for New Metrics

**Files:**
- Modify: `lib/financial-extractor.ts:84-107`

- [ ] **Step 1: Expand the expected metrics list in `checkCompleteness`**

Replace the `expectedIfPresent` array in `checkCompleteness` (lines 88-95):

```typescript
  const expectedIfPresent: { metric: string; tableSignal: string }[] = [
    { metric: "driftsinntekter", tableSignal: "revenue" },
    { metric: "varekostnad", tableSignal: "cost of goods" },
    { metric: "personalkostnader", tableSignal: "employee benefit" },
    { metric: "avskrivninger", tableSignal: "depreciation" },
    { metric: "driftsresultat", tableSignal: "operating result" },
    { metric: "ebitda", tableSignal: "ebitda" },
    { metric: "finanskostnader", tableSignal: "finance cost" },
    { metric: "aarsresultat", tableSignal: "profit" },
    { metric: "sum_eiendeler", tableSignal: "total assets" },
    { metric: "egenkapital", tableSignal: "total equity" },
    { metric: "total_gjeld", tableSignal: "total liabilities" },
    { metric: "operasjonell_kontantstrom", tableSignal: "operating activities" },
  ];
```

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/financial-extractor.ts
git commit -m "feat: expand completeness checks for new IFRS metrics"
```

---

### Task 9: Final Integration Verification

**Files:**
- All modified files

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: PASS — zero errors

- [ ] **Step 2: Verify Convex schema compiles**

Run: `npx convex dev --once`
Expected: Schema pushed successfully

- [ ] **Step 3: Test the build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Final commit and push**

```bash
git push
```
