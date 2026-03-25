# Cumulative Period Derivation Design

## Problem

Many European/IFRS companies (e.g., Cadeler) report with a cumulative cadence: Q1 (standalone), H1 (6-month cumulative), 9M (9-month cumulative), AR (full year). The system currently treats every period as independent, which means:

- Revenue appears to "grow" from Q1 → H1 → 9M → FY because cumulative numbers are stored alongside standalone ones
- Standalone Q2, Q3, Q4 cannot be shown for these companies
- Quarter-over-quarter comparison is impossible for cumulative reporters
- The LLM may misidentify a 9M report as "Q3", corrupting period labels

### Evidence from Cadeler Reports

**H1 2025 report**: Income statement columns are "H1 2025" and "H1 2024" — purely cumulative 6-month figures. Revenue = 298,535 TEUR (Jan-Jun total). No standalone Q2 column.

**Q3 2025 report (actually 9M)**: Column headers are "9M 2025" and "9M 2024" — cumulative 9-month figures. Revenue = 452,785 TEUR (Jan-Sep total). Cover page explicitly states "For the period 1 January to 30 September 2025".

### Prevalence

In the current tracked portfolio, ~10% of companies use the cumulative pattern. However, IAS 34 (the IFRS interim reporting standard) requires cumulative YTD income statements, making this the standard European pattern. As more Nordic/European companies are added, this pattern will become increasingly common.

## Approach: Store-as-reported, derive at query time

Store exactly what each PDF contains with metadata about whether figures are cumulative or standalone. Derive standalone quarters deterministically in code (never LLM) at query/display time.

## Design

### 1. Period Model & Schema Changes

**New field on `documents` table:**

```
periodScope: "standalone" | "cumulative"
```

This is the **report-level** scope determined by the LLM from column headers. The derivation logic infers **per-metric** scope from the metric's `category`:
- `category === "balanse"` → always treated as snapshot (point-in-time), never subtracted
- `category === "resultat"` or `"kontantstrøm"` → uses the document's `periodScope`
- `category === "nøkkeltall"` → percentages/ratios, never subtracted

This avoids needing `periodScope` on every metric row while correctly handling that a single H1 report contains both cumulative income statement items and point-in-time balance sheet items.

**Period examples:**
- `Q1 report` → `period: "2025-Q1"`, `periodScope: "standalone"`
- `H1 report` → `period: "2025-H1"`, `periodScope: "cumulative"` (covers Q1+Q2)
- `9M report` → `period: "2025-9M"`, `periodScope: "cumulative"` (covers Q1+Q2+Q3)
- `AR/FY report` → `period: "2025-FY"`, `periodScope: "cumulative"` (covers full year)
- Standalone Q2 report → `period: "2025-Q2"`, `periodScope: "standalone"`

**Backward compatibility:** Existing documents without `periodScope` are treated as `"standalone"` (the current implicit assumption). No migration required.

**New canonical period form in `lib/period-format.ts`:**

- `2025-9M` — nine-month cumulative (new; prevents misclassification as Q3)
- Input patterns to match: `"9M 2025"`, `"9m 2025"`, `"nine months 2025"`, `"first nine months 2025"`, `"Q1-Q3 2025"`

**`periodToFileName` update:** `"2025-9M"` → `"9M25"`

**`sortPeriods` update:** Define explicit chronological order: `Q1 < Q2 < H1 < Q3 < 9M < Q4 < H2 < FY` (cannot rely on alphabetical sort since `9M` sorts incorrectly).

**LLM determines scope** from column headers: "H1", "9M", "six months", "nine months" → cumulative. "Q1", "Q2", "first quarter" → standalone. Evidence quote required via new `periodEvidence` field.

### 2. Metric-Type Rules for Derivation

**Subtractable (flow metrics):**
- Income statement: `driftsinntekter`, `driftsresultat`, `ebitda`, `resultat_for_skatt`, `aarsresultat`
- Cash flow: `operasjonell_kontantstrom`, `investeringsaktiviteter`, `finansieringsaktiviteter`, `fri_kontantstrom`, `netto_endring_kontanter`

**NOT subtractable:**
- Balance sheet (snapshots): `sum_eiendeler`, `egenkapital`, `total_gjeld`, `kontanter`
- Percentage ratios: `driftsmargin`, `ebitda_margin`, `netto_margin`, `roe`, `roa`, `gjeldsgrad`, `egenkapitalandel`
- EPS: `resultat_per_aksje` — NOT additive across periods (EPS = net income / weighted avg shares; share count changes quarterly, so H1 EPS ≠ Q1 EPS + Q2 EPS). Excluded from derivation entirely.

**Recomputable from derived absolutes:**
- Margins recomputed after deriving standalone revenue/profit (uses existing query-time margin computation in `convex/financialMetrics.ts`)

**Derivation chain for cumulative reporters:**

```
Q1 = Q1 report (direct)
Q2 = H1 - Q1          (requires: Q1, H1)
Q3 = 9M - H1          (requires: H1, 9M)
Q4 = FY - 9M          (requires: 9M, FY)
```

**Validation after derivation:**
- Negative values for normally-positive metrics (e.g., revenue) → flag, don't silently store
- Cross-check: Q1 + Q2 + Q3 + Q4 should equal FY for all flow metrics

### 3. Derivation Logic — Query Time in Convex

Derivation happens **at query time in `convex/financialMetrics.ts`**, not at ingestion.

**Why query-time:**
- Reports arrive in any order (H1 before Q1)
- Reports can be reprocessed (admin endpoint re-extracts)
- No stale derived data — always from latest extracted values
- No cascading updates when one report changes

**Query flow:**

1. Fetch all stored metrics for company + year
2. Check what periods exist and their `periodScope`
3. For each missing standalone quarter, check if prerequisite cumulative periods exist
4. If yes, compute standalone value by subtraction
5. Return metrics tagged with `source: "extracted" | "derived"`. Derived metrics include provenance:

```typescript
interface DerivedMetric {
  // ...standard metric fields
  source: "derived";
  derivation: {
    formula: "H1 - Q1";  // human-readable
    operands: { period: string; value: number; documentId: Id<"documents"> }[];
  };
}
```

**Edge cases:**
- Missing prerequisite → return `null`, never guess
- Both cumulative and standalone exist for same quarter → prefer standalone; if both exist and differ by >5%, emit a data quality warning (catches upstream extraction errors)
- Mixed reporting within a year → works naturally, uses whatever periods are available
- Company switches pattern between years → no problem, per-year logic
- Alternative derivation paths: if standalone Q1 and Q2 exist but no H1, derive Q3 as `9M - Q1 - Q2` (sum available standalones)

**Guards before subtraction:**
- **Unit consistency:** Verify both operands share the same `unit` (e.g., both MEUR). If units differ, refuse to derive and return `null`.
- **Currency consistency:** Verify both operands share the same `currency`. Companies occasionally change reporting currency between periods.

**Performance:** Simple arithmetic on small metric sets per company. Queries accept a `year` filter to limit scope. Negligible cost.

**Interaction with existing magnitude check:** The cross-period magnitude check in `route.ts` compares new revenue against the latest stored revenue. For cumulative reporters, H1 revenue is ~2x Q1 and 9M is ~3x Q1 — these ratios are well under the 10x threshold and won't trigger false positives. The check runs on raw stored values (before derivation), so derived metrics don't affect it.

**Interaction with report filters:** Derived metrics have no single backing `documentId`. The filter system in `report-filters.ts` needs a bypass: when derived metrics are included in a query result, they pass through document filters if ANY of their source documents match the filter criteria.

### 4. Extraction Prompt Changes

**New RULE 4 added to extraction prompt in `lib/financial-extractor.ts`:**

> RULE 4 — Period Scope Detection
>
> Before extracting numbers, determine if this report presents standalone or cumulative figures:
>
> Cumulative indicators: "H1", "1H", "first half", "six months", "9M", "nine months", "first nine months", "year ended", "full year", "FY"
>
> Standalone indicators: "Q1", "Q2", "Q3", "Q4", "first quarter", "second quarter", "three months ended [single quarter range]"
>
> If a report has both a standalone and cumulative column for the SAME current period (e.g., "Q3 2025" alongside "9M 2025"): extract ONLY the standalone quarter column. Do not confuse this with cumulative-vs-prior-year comparisons (e.g., "9M 2025" vs "9M 2024") — those are both cumulative, different years; extract the current year.
>
> Provide `periodEvidence` — exact text proving the period scope.

**New output fields:**

```json
{
  "period": "H1 2025",
  "periodScope": "cumulative",
  "periodEvidence": "Column header reads 'H1 2025', covering 1 January to 30 June",
  ...
}
```

Rules 1-3 (use tables, detect units, normalize to millions) unchanged.

### 5. Dashboard & Display

- Derived metrics shown with subtle visual indicator ("derived" badge or different text color)
- Tooltip shows derivation source: "Q2 revenue derived from H1 (298.5M) minus Q1 (82.1M)"
- Missing prerequisite → quarter shown as empty, never the cumulative number in a quarterly slot
- Consistent quarterly view regardless of reporting pattern:

```
         Q1      Q2      Q3      Q4
Revenue  82.1   216.4   154.3    ...
         [src]  [der]   [der]
```

- Existing period filtering by type/year continues to work
- Raw cumulative views (H1, 9M, FY) remain available
- No changes to chat/RAG functionality

## Key Files Affected

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `periodScope` to documents table |
| `lib/period-format.ts` | Add `2025-9M` canonical form, scope detection helpers |
| `lib/financial-extractor.ts` | Add RULE 4, `periodScope`/`periodEvidence` to prompt output |
| `convex/financialMetrics.ts` | Query-time derivation logic |
| `components/dashboard/overview-tab.tsx` | Display derived indicators, tooltips |
| `app/api/upload/process/route.ts` | Pass `periodScope` through pipeline |
| `lib/report-filters.ts` | Allow derived metrics to pass through document filters |

## Non-Goals

- No changes to PDF parsing or markdown extraction
- No changes to unit detection or normalization
- No retroactive reprocessing of existing documents (can be done manually via admin endpoint)
- No support for H2 derivation (H2 = FY - H1) — can be added later if needed
- No handling of restated prior-period figures (restatements would require re-uploading the source report)
- No segment-level derivation — only consolidated figures
- No retroactive migration required — existing documents without `periodScope` default to `"standalone"`
