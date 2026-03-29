# Hybrid Mode + stripNumericSeparators Fix

**Date**: 2026-03-29
**Status**: Approved

## Problem

Two issues remain after the structural extraction pipeline:

1. **`stripNumericSeparators` corrupts fallback data** — The space-stripping regex was designed for pipe tables (one number per cell). On the fallback path (flat text from documents where no pipe tables are found), it merges separate column values into one giant number: `51 309 15 856` → `5130915856`. This corrupts ~40% of numeric lines in fallback documents (Vend, Salmon Evolution, Cadeler).

2. **Some PDFs produce flat text instead of pipe tables** — The PDF-to-markdown converter (`@opendataloader/pdf`) fails to detect borderless/complex tables in some report formats (Vend/Schibsted, Cadeler, Salmon Evolution), producing flat text blobs instead of pipe-delimited markdown tables. The structural pipeline's table parser can't work with flat text.

## Solution

### Part 1: Fix stripNumericSeparators scope

Apply the full `stripNumericSeparators` (commas + spaces) only to structured table output where each cell contains exactly one number. For the fallback path (raw text sent to LLM), apply only comma stripping.

In `prepareStructuredInput()`:
- Structured path: `stripNumericSeparators(structured)` — full stripping (commas + spaces)
- Fallback path: `stripCommasOnly(extractFinancialSections(markdown))` — commas only, preserves spaces

This prevents data corruption while keeping the space-stripping benefit for properly parsed tables.

### Part 2: Enable opendataloader hybrid mode

`@opendataloader/pdf` v2 supports a `hybrid` option that routes pages with complex/borderless tables to a Docling AI backend for ML-based layout analysis. The output remains the same markdown format but with proper pipe-delimited tables where flat text was previously produced.

**Architecture:**

Two Railway services:
- **App service** (existing) — Next.js + opendataloader with `hybrid: "docling-fast"` enabled
- **docling-serve** (new) — Separate Railway service running `ghcr.io/docling-project/docling-serve` Docker image

**Config change in `lib/pdf-processor.ts`:**

Add `hybrid` and `hybridUrl` options to the `convert()` call:
```typescript
await convert([inputPath], {
  outputDir,
  format: "markdown",
  imageOutput: "off",
  contentSafetyOff: "hidden-text",
  hybrid: "docling-fast",
  hybridUrl: process.env.DOCLING_SERVE_URL || "http://localhost:5002",
  quiet: true,
});
```

**docling-serve deployment:**
- Docker image: `ghcr.io/docling-project/docling-serve`
- RAM: ~2-4GB (CPU-only, no GPU)
- Runs as a separate Railway service with its own 8GB allocation
- Connected via Railway internal networking (e.g. `http://docling-serve.railway.internal:5002`)
- No public URL needed — only called by the app service

**Memory budget:**
- App service: Next.js (~1-2GB) + Java subprocess during conversion (4GB peak, not persistent) = fits in 8GB
- docling-serve: 2-4GB in its own 8GB replica = fits comfortably
- No conflict since they run in separate replicas

**Fallback behavior:** If `DOCLING_SERVE_URL` is not set or the service is unreachable, opendataloader continues without hybrid mode (current behavior). This ensures the app works in local dev without docling-serve running, and degrades gracefully if the service goes down.

**Environment variable:**
- `DOCLING_SERVE_URL` — set in Railway app service env vars, pointing to the internal URL of the docling-serve service

## Files Changed

| File | Change |
|------|--------|
| `lib/financial-extractor.ts` | Split `stripNumericSeparators` into two functions; scope space-stripping to structured path only |
| `lib/pdf-processor.ts` | Add `hybrid` and `hybridUrl` options to `convert()` call |
| `__tests__/financial-extractor.test.ts` | Add tests verifying fallback path preserves spaces |

## Testing Strategy

- **stripNumericSeparators fix**: Unit test that flat text with space-separated values (`51 309 15 856`) is NOT merged on the fallback path, while structured table output still gets spaces stripped
- **Hybrid mode**: Manual test — re-convert a failing PDF (e.g. Vend Q1 2025) with docling-serve running locally and verify pipe tables are produced
- **Regression**: Re-convert a passing PDF (e.g. Reach Subsea Q4 2025) and verify output is unchanged or improved
- **Integration**: Re-process all 30 documents after hybrid mode is enabled and compare metric counts

## Deployment Steps

1. Deploy `docling-serve` as a new Railway service (Docker image, no code changes)
2. Set `DOCLING_SERVE_URL` in app service environment variables
3. Deploy app service with the code changes
4. Re-process all documents to get improved table extraction

## Constraints

- **Railway Hobby plan**: Supports multiple services per project, each with 8GB RAM
- **Local dev**: Works without docling-serve (hybrid mode degrades to non-hybrid)
- **No RAG impact**: Same markdown format from opendataloader, just better table detection. RAG chunks will be equal or better quality.
