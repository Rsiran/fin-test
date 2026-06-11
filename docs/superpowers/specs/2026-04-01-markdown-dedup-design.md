# Markdown Dedup & Deinterleaving — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

## Problem

The PDF-to-markdown conversion produces two critical formatting issues for financial reports:

1. **Scrambled/interleaved content** (lines 2055–2315 in typical output): P&L and Balance Sheet from side-by-side PDF pages are merged into a single garbled stream. Labels like 'Revenue', 'Raw materials' become detached from their numbers. Note references appear as orphaned bullet points.
2. **Duplicated statements** (lines 2315–2650): Facing-page spreads cause the converter to treat each page of a spread as separate, producing Balance Sheet 5x, P&L 3x, Cash Flow 3x, Equity Changes 3x.

These issues primarily affect **quarterly reports** (compact layouts with facing-page spreads). Annual reports usually give each statement its own page.

## Approach: Page-Separator + Post-Processing Deinterleaver

### Fix 1: Conversion Config — Page Separator

**File:** `lib/pdf-processor.ts`

Add `markdownPageSeparator` to the opendataloader convert options:

```typescript
markdownPageSeparator: "---\n<!-- PAGE %page-number% -->\n",
```

This inserts an HTML comment with the page number between each page's content. The `---` gives a visible markdown break, and the comment is machine-parseable but invisible when rendered. All other conversion config stays unchanged.

### Fix 2: Post-Processing Module — `lib/markdown-dedup.ts`

New module that runs after conversion, before markdown is stored or chunked. Three phases:

#### Phase 1: Split by page

Parse the markdown on `<!-- PAGE N -->` boundaries into an array of `{ pageNumber: number, content: string }` objects.

#### Phase 2: Deduplicate pages

Compare pages pairwise for content overlap. Two pages are duplicates if:

- They share >80% of their non-empty lines (normalized: lowercased, whitespace-collapsed)
- They contain the same statement type (detected via existing `table-classifier.ts` heading/row patterns)

When duplicates are found, keep the one with more content (more non-empty lines) and drop the other.

#### Phase 3: Deinterleave scrambled pages

For each remaining page, check if it contains row labels from multiple statement types. Classification vocabulary:

| Statement | Unambiguous signals |
|---|---|
| Income Statement | driftsinntekter, salgsinntekt, varekostnad, lønnskostnad, driftsresultat, ebitda, finansinntekter, finanskostnader, resultat før skatt, skattekostnad, årsresultat, revenue, cost of goods, gross profit, operating profit, earnings per share |
| Balance Sheet | eiendeler, anleggsmidler, omløpsmidler, egenkapital, gjeld, goodwill, varige driftsmidler, kundefordringer, leverandørgjeld, sum eiendeler, total assets, total equity, total liabilities, inventories, trade receivables, share capital |
| Cash Flow | kontantstrøm fra, driftsaktiviteter, investeringsaktiviteter, finansieringsaktiviteter, netto endring, operating activities, investing activities, financing activities, net change in cash |

If a page contains labels from 2+ statement types:

1. Classify each line by scanning for keywords
2. Lines matching no keyword inherit the classification of the nearest preceding classified line
3. Split into separate blocks per statement type
4. Reassemble in canonical order: P&L → BS → CF → Equity Changes

**Ambiguous rows** (e.g. "avskrivninger" appears in both P&L and CF) resolved by context: surrounding classified rows determine the statement type.

**Confidence threshold:** If fewer than 60% of lines in a mixed-statement page can be classified, skip that page and return it unchanged.

#### Function signature

```typescript
export function deduplicateMarkdown(markdown: string): string
```

Returns cleaned markdown with page separators preserved. If input has no `<!-- PAGE N -->` markers, returns input unchanged.

### Fix 3: Pipeline Integration

**File:** `app/api/upload/process/route.ts`

The pipeline changes from:

```
convertPdfToMarkdown(pdfBuffer) → markdown → store + chunk + extract
```

To:

```
convertPdfToMarkdown(pdfBuffer) → raw markdown → deduplicateMarkdown(raw) → clean markdown → store + chunk + extract
```

One additional function call in the route handler. All downstream consumers (chunking, embedding, extraction) receive cleaner input without changes to their own logic.

### Fix 4: Keep PDF in R2

**File:** `app/api/upload/process/route.ts`

Remove the `deleteObject` call at the end of the process route. The PDF must be retained in R2 so re-processing is possible.

### Fix 5: Re-Process Button

Add a "Re-process" action to the document list UI. When clicked:

1. Re-download the PDF from R2
2. Run `convertPdfToMarkdown` → `deduplicateMarkdown` → store/chunk/extract pipeline
3. Replace existing markdown, chunks, embeddings, and metrics for that document
4. Set document status to `"processing"` during re-process, then `"ready"` on completion

### Fix 6: Classifier Heading Expansion

**File:** `lib/table-classifier.ts`

Add missing formal IFRS Norwegian headings:

- `INCOME_HEADING`: add "oppstilling over resultat", "oppstilling over totalresultat", "konsernresultat", "konsernresultatregnskap"
- `BALANCE_HEADING`: add "oppstilling over finansiell stilling", "konsernbalanse"
- `CASHFLOW_HEADING`: add "oppstilling over kontantstrømmer", "konsernets kontantstrømoppstilling"

## Edge Cases

### Multi-page single statement

A Balance Sheet often has assets on page N and equity+liabilities on page N+1. Detection: if page N ends without a "sum eiendeler" / "total assets" total row AND page N+1 starts with balance sheet rows but no heading, merge them into one block.

### Non-financial tables

Notes, APM reconciliations, segment tables pass through unchanged. The deinterleaver only acts on pages containing row labels from 2+ statement types.

### Well-behaved PDFs

For PDFs with one statement per page, the deduplicator is a no-op. Only cost is page-separator parsing, which is negligible.

### Existing documents without page separators

`deduplicateMarkdown()` returns input unchanged if no `<!-- PAGE N -->` markers are present. The re-process button re-converts with new config, adding separators.

## Files Changed

| File | Change |
|---|---|
| `lib/pdf-processor.ts` | Add `markdownPageSeparator` option |
| `lib/markdown-dedup.ts` | **New file** — dedup + deinterleave post-processor |
| `app/api/upload/process/route.ts` | Call `deduplicateMarkdown()`, remove PDF deletion from R2 |
| `lib/table-classifier.ts` | Add formal IFRS Norwegian headings |
| UI (document list component) | Add "Re-process" button |
| Convex mutation/action | Add re-process endpoint that re-downloads PDF and re-runs pipeline |
