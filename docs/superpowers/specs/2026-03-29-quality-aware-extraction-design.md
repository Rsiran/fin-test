# Quality-Aware Extraction Pipeline

**Date**: 2026-03-29
**Status**: Approved

## Problem

The extraction pipeline has no way to detect bad results. The same input can produce 3 metrics or 15 depending on LLM nondeterminism. Balance sheet values can be 1000x off. EBITDA can be silently missed. These issues are only discovered when a human looks at the dashboard.

Existing quality signals (metric count, completeness warnings, balance sheet identity checks) are logged but not acted on.

## Solution: Quality Gate with Escalating Retry Strategies

Score each extraction result. If the score is below threshold, automatically retry with progressively more expensive strategies until the result is acceptable or all strategies are exhausted.

## Component 1: Quality Scorer

Pure function — no LLM, no side effects.

```typescript
interface QualityScore {
  score: number;              // 0-100
  missing: string[];          // metrics present in input but not extracted
  warnings: string[];         // human-readable issues
  usedStructuredPath: boolean;
  balanceSheetValid: boolean;
}

function scoreExtraction(
  metrics: ExtractedMetric[],
  structuredInput: string,
  usedStructuredPath: boolean
): QualityScore
```

**Scoring rules:**
- +10 per core metric found: `driftsinntekter`, `driftsresultat`, `ebitda`, `aarsresultat`, `sum_eiendeler`, `egenkapital`, `total_gjeld`, `operasjonell_kontantstrom` — max 80
- +10 if balance sheet identity holds (assets within 20% of equity + liabilities)
- +10 if structured path was used (not fallback)
- -20 if balance sheet auto-correction triggered (1000x off)
- -10 per expected metric that was in the input text but not extracted

**Threshold:** Score ≥ 60 = accept. Score < 60 = retry.

## Component 2: Column Count Hints for Flat Text

When the pipeline falls back to raw text (no pipe tables found), detect column structure and prepend context for the LLM.

```typescript
function detectColumnHints(markdown: string): string | null
```

**How it works:**
1. Find lines matching `label number number number...` pattern
2. Count numbers on the first data line → column count
3. Scan fragmented header lines above and reconstruct column labels
4. Return a hint string: `"This report has 5 columns: Q2 2025 | Q2 2024 | YTD 2025 | YTD 2024 | Year 2024. Extract from the FIRST column only (current standalone quarter)."`

Best-effort heuristic — returns null if header reconstruction fails. The LLM already handles flat text somewhat; this reduces ambiguity about which column to pick.

## Component 3: Extraction Orchestrator

Wraps `extractFinancialData` with a quality gate and retry loop.

```typescript
async function extractWithRetry(
  markdown: string,
  options?: {
    pdfBuffer?: Buffer;
    historicalMetrics?: { metricName: string; value: number }[];
  }
): Promise<ExtractionResult & { quality: QualityScore }>
```

**Retry strategies (in escalation order):**

1. **Retry same prompt** — LLM nondeterminism means a second attempt may succeed. Cost: 1 API call.

2. **Re-convert with hybridMode: "full"** — If no financial tables were found and `pdfBuffer` is available, re-convert the PDF with `hybridMode: "full"` (all pages to Docling, not just complex ones). Then re-extract from the new markdown. Cost: 1 conversion + 1 API call.

3. **Retry with feedback** — Tell the LLM what it missed: "Previous attempt extracted only 3 metrics. The input contains rows for: Operating revenues, EBITDA, Total assets. Please extract ALL metrics." Cost: 1 API call.

4. **Multi-attempt voting** — Run extraction 3 times, take consensus per metric (majority vote on value). Cost: 3 API calls.

Each strategy only fires if the previous one's score is still below 60. The orchestrator returns the best result seen across all attempts (highest score), even if none hit the threshold.

**Cost guardrail:** Maximum 7 LLM calls per document (1 initial + 1 retry + 1 after re-convert + 1 feedback + 3 voting). In practice most documents will use 1 call.

## Component 4: Feedback Extraction Variant

A variant of the extraction prompt that includes information about what was missed:

```typescript
async function extractWithFeedback(
  structuredInput: string,
  missing: string[]
): Promise<ExtractionResult>
```

Prepends to the system prompt: "Previous extraction attempt missed these metrics that appear in the input: [missing]. Make sure to extract them."

## Integration Points

**Where it hooks in:** `extractWithRetry` replaces the direct call to `extractFinancialData` in `app/api/upload/process/route.ts`.

**Quality score storage:** Add optional `extractionQuality` (number) to the documents table in Convex schema. Stored for potential UI surfacing later.

## Files Changed

| File | Change |
|------|--------|
| `lib/quality-scorer.ts` | **New** — `scoreExtraction()` |
| `lib/column-hints.ts` | **New** — `detectColumnHints()` |
| `lib/extraction-orchestrator.ts` | **New** — `extractWithRetry()` |
| `lib/financial-extractor.ts` | **Modified** — export `extractWithFeedback()`, accept column hints in `prepareStructuredInput()` |
| `app/api/upload/process/route.ts` | **Modified** — call `extractWithRetry` instead of `extractFinancialData` |
| `convex/schema.ts` | **Modified** — add optional `extractionQuality` field |

## Testing Strategy

- **Quality scorer:** Unit test with known metric sets — verify scoring math, threshold behavior, missing metric detection
- **Column hints:** Unit test with Vend flat-text excerpts — verify column count detection and header reconstruction
- **Orchestrator:** Unit test the retry logic with mocked extraction results at different quality levels — verify correct strategy escalation
- **Integration:** Re-process the Vend Q2 document and verify improved metric count

## Constraints

- **Cost guardrail:** Max 7 LLM calls per document. Most documents (those with pipe tables and score ≥ 60 on first attempt) use exactly 1.
- **Railway 8GB RAM:** No change to memory profile — all retry logic is in the Node.js process.
- **Processing time:** Worst case adds ~30-60 seconds per document (additional API calls). Acceptable for background processing.
