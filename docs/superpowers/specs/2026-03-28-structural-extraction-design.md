# Structural Pre-processing for Financial Report Extraction

**Date**: 2026-03-28
**Status**: Approved

## Problem

The current extraction pipeline sends up to 80KB of raw markdown to GPT-4o and asks it to find the right tables, detect units, pick the correct column, and extract values — all in one pass. This leads to three categories of errors:

1. **Wrong table selection** — The LLM reads from summary/highlights tables (e.g., "Key Figures" with rounded NOKm values) instead of the actual financial statements (income statement, balance sheet, cash flow with precise TNOK values). Result: missing metrics (EBITDA absent from Key Figures but present in income statement) and imprecise values (474 vs 474.138).

2. **Mixed unit detection** — When a document has tables with different units (Key Figures in NOKm, financial statements in NOK 1000), the LLM may apply one table's unit to another table's values. Result: balance sheet values off by 1000x (equity stored as 1.218 MNOK instead of 1218 MNOK).

3. **Inconsistent period formats** — `canonicalizePeriod()` handles "Q1 2025" but not "1Q 2025". The LLM returns whichever format the PDF uses, and unrecognized formats pass through unchanged.

These bugs were found across Reach Subsea quarterly reports but the root causes are structural and will affect any company with similar report formats.

## Solution: Structural Pre-processing

Replace the current flow:

```
PDF → Markdown → extractFinancialSections (keyword scoring) → LLM (everything)
```

With:

```
PDF → Markdown → parseMarkdownTables → classifyTables → resolveUnits → LLM (structured input)
```

The key principle: **remove ambiguity before the LLM sees it.** Table selection, classification, and unit detection become deterministic and testable. The LLM's job shrinks to column selection and metric name mapping.

## Component 1: Table Parser

Parse raw markdown into structured table objects.

```typescript
interface ParsedTable {
  heading: string;              // nearest # heading above the table
  headerRow: string[];          // column headers
  rows: { label: string; values: string[] }[];
  rawText: string;              // original markdown
  lineNumber: number;           // position in document
  unitIndicator: string | null; // "NOK 1000", "NOKm", etc. extracted from header
  detectedUnit: "thousands" | "millions" | "billions" | "whole" | null;
}
```

The parser:
- Splits on markdown table syntax (`|...|`)
- Captures the nearest `#` heading above each table
- Extracts the unit indicator from the header row or heading using regex (reusing the unit patterns already defined in the extraction prompt: `NOK 1000`, `NOKm`, `TNOK`, `EUR'000`, `MEUR`, etc.)
- Strips `<br>` tags and normalizes malformed multi-row cells (seen in Reach Subsea balance sheets where PDF conversion merges rows)
- Strips numeric commas from values (currently done in `stripNumericCommas`)

## Component 2: Table Classifier

Each parsed table gets classified into one of:

```typescript
type TableClass =
  | "income_statement"     // resultatregnskap
  | "balance_sheet"        // balanse
  | "cash_flow"            // kontantstrøm
  | "key_figures_summary"  // nøkkeltall/highlights — excluded from extraction
  | "notes"                // footnotes, reconciliations
  | "other"                // shareholder info, operational data, etc.
```

Classification uses deterministic signals (no LLM):

**Income statement** — heading/header contains: "profit or loss", "resultatregnskap", "income statement", "statement of comprehensive income". Row labels include: "revenue", "driftsinntekter", "EBITDA", "EBIT", "operating result".

**Balance sheet** — heading/header contains: "financial position", "balanse", "balance sheet". Row labels include: "total assets", "sum eiendeler", "total equity", "egenkapital".

**Cash flow** — heading/header contains: "cash flow", "kontantstrøm". Row labels include: "operating activities", "operasjonelle aktiviteter".

**Key figures summary** — heading contains: "key figures", "nøkkeltall", "highlights", "hovedtall". Or: table has `(NOKm)` / `(NOKbn)` in individual row labels while other tables in the same document use a different unit in their header. Or: fewer than 5 data columns and values appear rounded.

**Notes** — heading contains: "note", "noter". Or appears after the main financial statements.

**Conflict resolution**: If a table matches multiple categories, prefer the more specific financial statement type. Financial statement types always beat "key_figures_summary".

**Only `income_statement`, `balance_sheet`, and `cash_flow` tables are sent to the LLM.** This structurally prevents the summary table problem.

## Component 3: Unit Resolver

Resolve units deterministically per-table before extraction. Resolution order (first match wins):

1. **Table header** — `"Statement of profit or loss (NOK 1000)"` → thousands
2. **Section heading** — `"## Resultatregnskap (beløp i tusen)"` → thousands
3. **Cross-table consistency** — if the income statement header says `NOK 1000`, assume balance sheet and cash flow use the same unit unless their own headers explicitly say otherwise
4. **Magnitude heuristic (fallback)** — if no explicit indicator, infer from value magnitudes. Revenue of `3525800` for a listed company → probably whole currency units; `3525` → probably thousands; `3.5` → probably billions

The resolved unit is attached to each table and passed explicitly to the LLM as context text, e.g.: `"This table uses NOK 1000 (thousands). Divide values by 1000 to get MNOK."`

Supported unit patterns (from both Norwegian and English reports):
- **Thousands**: TNOK, TEUR, TSEK, TDKK, TUSD, TGBP, `NOK 1000`, `EUR 1 000`, `'000`, `(000s)`, `(tusen)`, `(thousands)`, `T€`, `T$`, `Tkr`
- **Millions**: MNOK, MEUR, MSEK, MDKK, MUSD, MGBP, `mill.`, `mill. kr`, `(NOKm)`, `(EURm)`, `M€`, `M$`, `Mkr`
- **Billions**: `mrd.`, `BNOK`, `BEUR`, `(NOKbn)`, `billions`

## Component 4: Revised LLM Extraction

The LLM receives structured input instead of raw document:

```
INCOME STATEMENT (unit: NOK 1000 → divide by 1000 for MNOK)
Columns: Q4 2025 | Q4 2024 | 12M 2025 | 12M 2024
|Revenue|606 077|684 809|2 677 042|2 717 702|
|EBITDA|228 315|300 178|1 142 790|1 169 899|
...

BALANCE SHEET (unit: NOK 1000 → divide by 1000 for MNOK)
Columns: 31.12.2025 | 31.12.2024
|Total equity|1 218 266|1 091 913|
|Total assets|3 605 794|3 247 702|
...

CASH FLOW (unit: NOK 1000 → divide by 1000 for MNOK)
...
```

**LLM prompt changes:**
- Remove all unit detection instructions (already resolved)
- Remove section selection logic (already done)
- Focus on three jobs: (1) identify the current period column (standalone quarter vs cumulative), (2) map row labels to standardized metric names, (3) normalize values using the provided unit

**What stays the same:**
- Period column detection (standalone quarter vs cumulative)
- Metric name standardization (`Revenue` → `driftsinntekter`, `EBITDA` → `ebitda`)
- Validation layer (`validateMetrics`)
- JSON response format

Typical input shrinks from ~80KB to ~3-5KB, which significantly improves LLM reliability.

## Component 5: Period Format Fix

Add missing patterns to `canonicalizePeriod()` in `lib/period-format.ts`:

```typescript
// "1Q 2025", "4Q 2025" → "2025-Q1", "2025-Q4"
const nqMatch = s.match(/(\d)q\s*(\d{4})/);
if (nqMatch) return `${nqMatch[2]}-Q${nqMatch[1]}`;

// "6M 2024" → "2024-H1"
const sixMMatch = s.match(/6m\s*(\d{4})/);
if (sixMMatch) return `${sixMMatch[1]}-H1`;

// "12M 2024" → "2024-FY"
const twelveMMatch = s.match(/12m\s*(\d{4})/);
if (twelveMMatch) return `${twelveMMatch[1]}-FY`;
```

## Component 6: Post-extraction Sanity Checks

Lightweight validation as a safety net after extraction:

1. **Completeness** — warn if any of `driftsinntekter`, `driftsresultat`, `ebitda`, `aarsresultat` are missing from the extraction when the income statement table had them as row labels. Log which expected metrics were not returned.

2. **Balance sheet identity** — check that `sum_eiendeler ≈ egenkapital + total_gjeld` (within 5%). A mismatch strongly suggests a unit error.

3. **Cross-period magnitude** — if the company has existing metrics, compare new values against historical. Revenue changing by more than 10x between consecutive quarters is almost certainly a unit detection error.

These checks log warnings and could surface in the UI as a data quality indicator. They do not block storage.

## Files Changed

| File | Change |
|------|--------|
| `lib/table-parser.ts` | **New** — `parseMarkdownTables()` function |
| `lib/table-classifier.ts` | **New** — `classifyTable()` function |
| `lib/unit-resolver.ts` | **New** — `resolveTableUnit()` function |
| `lib/financial-extractor.ts` | **Modified** — replace `extractFinancialSections()` with structural pipeline. Simplify LLM prompt. Add sanity checks. |
| `lib/period-format.ts` | **Modified** — add `1Q 2025`, `6M`, `12M` patterns to `canonicalizePeriod()` |

## Testing Strategy

- **Table parser**: unit test with markdown snippets from Reach Subsea, Bouvet, and hand-crafted edge cases (malformed `<br>` rows, missing headers, no unit indicator)
- **Classifier**: unit test each table type with real examples. Test conflict resolution (table matching both income_statement and key_figures_summary)
- **Unit resolver**: unit test all supported unit patterns. Test cross-table fallback. Test magnitude heuristic
- **Integration**: re-run extraction on the 5 Reach Subsea documents that had errors. Verify EBITDA is extracted for all 12 quarters, balance sheet values are correct for 4Q 2025, and all periods use `YYYY-QN` format
- **Regression**: re-run on Bouvet annual report to verify no regression

## Constraints

- **Railway 8GB RAM** — no change to memory profile; we're parsing markdown strings, not spawning new processes
- **Convex function limits** — no change; the pre-processing runs in the Next.js API route, not in Convex
- **GPT-4o API cost** — should decrease since input is much smaller (~3-5KB vs ~80KB)
