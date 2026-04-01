# Structural Extraction Fixes — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

## Problem

The financial data extraction pipeline has structural issues that cause:
- Currency loss during table parsing (e.g. `MNOK` → `"millions"`, NOK discarded)
- Narrow hardcoded metric list (~15 items) that drops IFRS line items like COGS, D&A, impairment, interest
- Silent unit corruption when tables use different scales (first table's unit applied to all)
- No audit trail for what the source document actually called each line item
- Weak validation (only 3 non-negative checks, no range/cross-metric validation)
- Historical magnitude cross-check is dead code

## Fix 1: Currency Extraction in Table Parser

**File:** `lib/table-parser.ts`

`detectUnit()` currently returns `{ indicator, unit }`. Change to return `{ indicator, unit, currency }`.

Currency regex patterns to add alongside existing unit patterns:
- `NOK`, `MNOK`, `TNOK`, `BNOK`, `(NOK)`, `(NOKm)`, `(NOKbn)` → `"NOK"`
- `EUR`, `MEUR`, `TEUR`, `BEUR` → `"EUR"`
- `USD`, `MUSD`, `TUSD`, `BUSD` → `"USD"`
- `SEK`, `MSEK`, `TSEK`, `BSEK` → `"SEK"`
- `DKK`, `MDKK`, `TDKK` → `"DKK"`
- `GBP`, `MGBP`, `TGBP` → `"GBP"`

The currency is always explicitly stated in documents — no fallback/default logic needed.

**Downstream changes:**
- `ParsedTable` interface gains `detectedCurrency: string | null`
- `unit-resolver.ts` → `ResolvedTable` gains `resolvedCurrency: string | null`
- `structured-input.ts` includes currency in `unitContext` string (e.g. "Values are in NOK thousands")
- LLM prompt `OPPGAVE 4` changes from "look for currency" to "currency has been detected as X — use it"

## Fix 2: Full IFRS Metric Taxonomy

**File:** `lib/financial-extractor.ts` (prompts + mapping)

Replace the narrow metric list with comprehensive IFRS coverage. The prompt's `OPPGAVE 2` section expands to:

### Income Statement (resultat)
| Metric Name | Aliases (EN/NO) |
|---|---|
| `driftsinntekter` | Revenue, Total revenue, Omsetning, Driftsinntekter, Net sales |
| `varekostnad` | Cost of goods sold, COGS, Raw materials, Varekostnad, Cost of sales |
| `bruttofortjeneste` | Gross profit, Bruttofortjeneste, Gross margin (absolute) |
| `personalkostnader` | Employee benefits, Personnel expenses, Lønnskostnader, Personalkostnader |
| `andre_driftskostnader` | Other operating expenses, Andre driftskostnader, Other OpEx |
| `avskrivninger` | Depreciation & amortisation, D&A, Av- og nedskrivninger (excl. impairment) |
| `nedskrivninger` | Impairment loss, Goodwill impairment, Write-down, Nedskrivning |
| `driftsresultat` | Operating profit, EBIT, Operating result, Driftsresultat |
| `ebitda` | EBITDA, EBITDAR |
| `finansinntekter` | Finance income, Interest income, Finansinntekter |
| `finanskostnader` | Finance expense, Finance costs, Interest expense, Finanskostnader |
| `resultat_for_skatt` | Profit before tax, Resultat før skatt, EBT |
| `skattekostnad` | Income tax expense, Tax, Skattekostnad |
| `aarsresultat` | Net income, Profit for the period, Årsresultat |
| `resultat_per_aksje` | EPS, Earnings per share, Resultat per aksje |

### Balance Sheet (balanse)
| Metric Name | Aliases (EN/NO) |
|---|---|
| `goodwill` | Goodwill |
| `immaterielle_eiendeler` | Intangible assets, Immaterielle eiendeler |
| `varige_driftsmidler` | Property plant & equipment, PP&E, Varige driftsmidler |
| `bruksrettseiendeler` | Right-of-use assets, Bruksrettseiendeler, ROU assets |
| `andre_anleggsmidler` | Other non-current assets, Andre anleggsmidler, Investments |
| `varer` | Inventories, Varelager, Varer |
| `kundefordringer` | Trade receivables, Accounts receivable, Kundefordringer |
| `kontanter` | Cash and cash equivalents, Cash, Kontanter, Bankinnskudd |
| `sum_eiendeler` | Total assets, Sum eiendeler |
| `egenkapital` | Total equity, Egenkapital, Shareholders' equity |
| `rentebærende_gjeld` | Interest-bearing debt, Rentebærende gjeld, Financial liabilities |
| `annen_gjeld` | Other liabilities, Trade payables, Annen gjeld, Non-interest-bearing |
| `total_gjeld` | Total liabilities, Total gjeld, Sum gjeld |

### Cash Flow (kontantstrøm)
| Metric Name | Aliases (EN/NO) |
|---|---|
| `operasjonell_kontantstrom` | Cash from operating activities, Operasjonell kontantstrøm |
| `investeringsaktiviteter` | Cash from investing activities, Investeringsaktiviteter |
| `finansieringsaktiviteter` | Cash from financing activities, Finansieringsaktiviteter |
| `fri_kontantstrom` | Free cash flow, FCF, Fri kontantstrøm |
| `netto_endring_kontanter` | Net change in cash, Netto endring kontanter |

### Ratios (nøkkeltall)
| Metric Name | Aliases (EN/NO) |
|---|---|
| `driftsmargin` | Operating margin, Driftsmargin |
| `ebitda_margin` | EBITDA margin |
| `netto_margin` | Net margin, Netto margin, Profit margin |
| `roe` | Return on equity, ROE |
| `roa` | Return on assets, ROA |
| `gjeldsgrad` | Debt-to-equity, Gjeldsgrad, Leverage ratio |
| `egenkapitalandel` | Equity ratio, Egenkapitalandel |

## Fix 3: Per-Table Unit Resolution

**File:** `lib/unit-resolver.ts`

Current behavior: first financial table's unit becomes the fallback for all other tables.

New behavior:
- Each table uses its own `detectedUnit`. No cross-table inheritance.
- If a table has no detected unit: `unitContext = "No unit detected. Infer from value magnitudes."` (same as today's null path, but now explicit)
- **Consistency check:** After resolution, if two financial tables (IS, BS, CF) have different explicit units, log a warning with both units and table classifications. Don't auto-correct — let the LLM handle it with the per-table context.
- Currency resolution follows the same logic: per-table, no inheritance, consistency warning if conflicting.

## Fix 4: `sourceLabel` on Metrics Schema

**File:** `convex/schema.ts`, `lib/financial-extractor.ts`

Add to `financialMetrics` table:
```
sourceLabel: v.optional(v.string())
```

The LLM prompt's JSON output format gains a `sourceLabel` field per metric:
```json
{
  "metricName": "varekostnad",
  "sourceLabel": "Raw materials and consumables used",
  "value": 248.3,
  "unit": "MNOK",
  "category": "resultat",
  "confidence": "high"
}
```

Stored at extraction time via `updateStatus` or metric insertion mutation. Enables auditing what the PDF actually called each line item.

## Fix 5: Expanded Validation

**File:** `lib/financial-extractor.ts`

### Non-negative metrics (expanded)
```
driftsinntekter, sum_eiendeler, kontanter, goodwill, 
varige_driftsmidler, immaterielle_eiendeler, varer, kundefordringer
```

### Range validation
- Percentage metrics (`unit === "%"`): reject if `|value| > 200`
- Ratio metrics (`gjeldsgrad`): reject if `value > 100` or `value < -10`
- EPS: reject if `|value| > 10000` (likely unit error)

### Cross-metric checks
- `|driftsresultat| <= |driftsinntekter|` (operating profit can't exceed revenue)
- `bruttofortjeneste <= driftsinntekter` (gross profit can't exceed revenue)
- `egenkapital + total_gjeld ≈ sum_eiendeler` (existing check, keep as-is)

### Quality scorer expansion
`CORE_METRICS` in `quality-scorer.ts` expanded to:
```
driftsinntekter, varekostnad, driftsresultat, ebitda, aarsresultat,
sum_eiendeler, egenkapital, total_gjeld, operasjonell_kontantstrom
```
(Added `varekostnad` as it's a fundamental IS line item.)

## Fix 6: Wire Up Historical Cross-Check

**File:** `app/api/upload/process/route.ts`, `lib/extraction-orchestrator.ts`

Before calling `extractWithRetry()`, the route handler queries existing company metrics:
```typescript
const historicalMetrics = await convex.query(
  api.financialMetrics.listByCompany, 
  { companyId }
);
```

Pass to orchestrator:
```typescript
const result = await extractWithRetry(markdown, { 
  pdfBuffer, 
  historicalMetrics 
});
```

Magnitude check expands from revenue-only to: `driftsinntekter`, `sum_eiendeler`, `egenkapital`. Threshold: 100x deviation flags a warning, 1000x rejects.

For first uploads (no historical data): no magnitude check — validation rules from Fix 5 are the only guardrails.

## Files Changed

| File | Change |
|---|---|
| `lib/table-parser.ts` | Add currency extraction to `detectUnit()`, update `ParsedTable` interface |
| `lib/unit-resolver.ts` | Per-table resolution, currency pass-through, consistency warnings |
| `lib/structured-input.ts` | Include currency in `unitContext` string |
| `lib/financial-extractor.ts` | Expanded IFRS metric list in prompts, `sourceLabel` in output format, expanded validation |
| `lib/quality-scorer.ts` | Expanded `CORE_METRICS` |
| `convex/schema.ts` | Add `sourceLabel` to `financialMetrics` |
| `convex/documents.ts` | Pass `sourceLabel` through mutations |
| `app/api/upload/process/route.ts` | Query historical metrics, pass to orchestrator, expand magnitude check |
| `lib/extraction-orchestrator.ts` | Accept and use `historicalMetrics` parameter |
