# Hybrid Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data corruption in the fallback extraction path and enable opendataloader's hybrid mode with docling-serve for better table detection.

**Architecture:** Split `stripNumericSeparators` so space-stripping only applies to structured table output (not fallback flat text). Add `hybrid` and `hybridUrl` config to `pdf-processor.ts`. Deploy docling-serve as a separate Railway service.

**Tech Stack:** TypeScript, Vitest, opendataloader hybrid mode, docling-serve (Docker)

**Spec:** `docs/superpowers/specs/2026-03-29-hybrid-extraction-design.md`

---

### Task 1: Fix stripNumericSeparators scope

**Files:**
- Modify: `lib/financial-extractor.ts`
- Modify: `__tests__/financial-extractor.test.ts`

- [ ] **Step 1: Add failing test for fallback path preserving spaces**

Add to `__tests__/financial-extractor.test.ts`, inside the existing `describe("prepareStructuredInput", ...)` block:

```typescript
  it("preserves spaces in fallback path (no pipe tables)", () => {
    // This markdown has NO pipe-delimited tables — triggers fallback
    const md = `
## Income statement

(NOK million) 2025 2024 Operating revenues 2015 1916 EBITDA 394 332
`;
    const result = prepareStructuredInput(md);
    // Spaces between separate values must be preserved
    expect(result).toContain("2015 1916");
    expect(result).toContain("394 332");
    // Commas should still be stripped
  });

  it("still strips commas in fallback path", () => {
    const md = `
## Income statement

EUR'000 2023 2022 Revenue 108,622 106,424 Cost of sales (59,858) (49,537)
`;
    const result = prepareStructuredInput(md);
    expect(result).toContain("108622");
    expect(result).toContain("106424");
    expect(result).not.toContain("108,622");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/financial-extractor.test.ts`
Expected: "preserves spaces in fallback path" FAILS (spaces are currently stripped)

- [ ] **Step 3: Split stripping functions and scope them**

In `lib/financial-extractor.ts`, replace the current `stripNumericSeparators` function with two functions:

```typescript
/**
 * Strip comma thousand separators from numbers.
 * "1,252,560" → "1252560". Preserves commas in non-numeric contexts.
 * Safe for both structured tables and raw flat text.
 */
function stripCommasOnly(text: string): string {
  return text.replace(/\b(\d{1,3})(,\d{3})+\b/g, (match) =>
    match.replace(/,/g, "")
  );
}

/**
 * Strip BOTH comma and space thousand separators from numbers.
 * "1,252,560" → "1252560", "1 338 842" → "1338842"
 * ONLY safe for structured table output where each cell has one number.
 * DO NOT use on flat text where multiple values are space-separated.
 */
function stripNumericSeparators(text: string): string {
  text = stripCommasOnly(text);
  text = text.replace(/\b(\d{1,3})((?:\s\d{3})+)\b/g, (match, first, rest) =>
    first + rest.replace(/\s/g, "")
  );
  return text;
}
```

Then update `prepareStructuredInput` to use the right function per path:

```typescript
export function prepareStructuredInput(markdown: string): string {
  const tables = parseMarkdownTables(markdown);
  const classified = tables.map((table) => ({
    table,
    classification: classifyTable(table),
  }));
  const resolved = resolveUnits(classified);
  const structured = buildStructuredInput(resolved);

  if (!structured) {
    // Fallback: only strip commas, NOT spaces (spaces separate column values in flat text)
    return stripCommasOnly(extractFinancialSections(markdown));
  }

  // Structured tables: safe to strip both commas and spaces (one number per cell)
  return stripNumericSeparators(structured);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/financial-extractor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All 92+ tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/financial-extractor.ts __tests__/financial-extractor.test.ts
git commit -m "fix: only strip space separators on structured table output, not fallback text"
```

---

### Task 2: Enable opendataloader hybrid mode

**Files:**
- Modify: `lib/pdf-processor.ts`

- [ ] **Step 1: Read the current pdf-processor.ts**

Verify the current `convert()` call at `lib/pdf-processor.ts`.

- [ ] **Step 2: Add hybrid config**

Update the `convert()` call to include hybrid mode options:

```typescript
await convert([inputPath], {
  outputDir,
  format: "markdown",
  imageOutput: "off",
  contentSafetyOff: "hidden-text",
  ...(process.env.DOCLING_SERVE_URL && {
    hybrid: "docling-fast",
    hybridUrl: process.env.DOCLING_SERVE_URL,
  }),
  quiet: true,
});
```

This conditionally enables hybrid mode only when `DOCLING_SERVE_URL` is set. In local dev without docling-serve, it behaves exactly as before.

- [ ] **Step 3: Add DOCLING_SERVE_URL to .env.example**

Add to `.env.example`:

```
# Docling Serve (optional — enables hybrid table detection for PDF processing)
DOCLING_SERVE_URL=
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (no behavioral change without the env var set)

- [ ] **Step 5: Commit**

```bash
git add lib/pdf-processor.ts .env.example
git commit -m "feat: enable opendataloader hybrid mode with docling-serve"
```

---

### Task 3: Deploy docling-serve on Railway

This is an infrastructure task, not a code task.

- [ ] **Step 1: Create a new Railway service**

In the Railway project dashboard:
- Click "New Service" → "Docker Image"
- Image: `ghcr.io/docling-project/docling-serve`
- Service name: `docling-serve`

- [ ] **Step 2: Configure the service**

Settings:
- Port: `5001` (docling-serve default)
- No public domain needed (internal only)
- Railway will assign an internal URL like `docling-serve.railway.internal`

- [ ] **Step 3: Set DOCLING_SERVE_URL in app service**

In the app service environment variables, add:
```
DOCLING_SERVE_URL=http://docling-serve.railway.internal:5001
```

- [ ] **Step 4: Redeploy app service**

Trigger a redeploy so the new env var takes effect.

- [ ] **Step 5: Verify by uploading a test PDF**

Upload one of the previously failing PDFs (e.g., a Vend quarterly report) and check:
- Does the markdown now contain pipe-delimited tables?
- Does the extraction produce 12+ metrics instead of 2?

---

### Task 4: Re-process all documents

- [ ] **Step 1: Run the reprocessing script**

```bash
CONVEX_DEPLOYMENT="dev:quick-chicken-84" npx tsx scripts/reprocess-all.ts
```

- [ ] **Step 2: Verify results**

Check that:
- No `stripNumericSeparators` corruption warnings
- Vend documents extract 10+ metrics
- Balance sheet fix triggers are reduced or eliminated
- EBITDA completeness warnings are reduced
