# Quality-Aware Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quality gate to the extraction pipeline that scores results and automatically retries with escalating strategies when the score is low.

**Architecture:** Three new modules (quality-scorer, column-hints, extraction-orchestrator) wrap the existing extraction pipeline. The orchestrator replaces the direct `extractFinancialData` call in the upload route. Quality scores are stored on documents for monitoring.

**Tech Stack:** TypeScript, Vitest, GPT-4o (unchanged)

**Spec:** `docs/superpowers/specs/2026-03-29-quality-aware-extraction-design.md`

---

### Task 1: Build quality scorer

**Files:**
- Create: `lib/quality-scorer.ts`
- Create: `__tests__/quality-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/quality-scorer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreExtraction } from "../lib/quality-scorer";
import { type ExtractedMetric } from "../lib/financial-extractor";

function metric(name: string, value: number, unit = "MNOK"): ExtractedMetric {
  return { metricName: name, value, unit, category: "resultat", confidence: "high" };
}

describe("scoreExtraction", () => {
  it("scores a complete extraction highly", () => {
    const metrics = [
      metric("driftsinntekter", 606),
      metric("driftsresultat", 80),
      metric("ebitda", 212),
      metric("aarsresultat", 57),
      metric("sum_eiendeler", 2692),
      metric("egenkapital", 928),
      metric("total_gjeld", 1764),
      metric("operasjonell_kontantstrom", 547),
    ];
    const result = scoreExtraction(metrics, "some input", true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.missing).toHaveLength(0);
  });

  it("scores a sparse extraction low", () => {
    const metrics = [
      metric("driftsinntekter", 1694),
      metric("ebitda", 583),
    ];
    const result = scoreExtraction(metrics, "some input", true);
    expect(result.score).toBeLessThan(60);
  });

  it("detects missing metrics present in input", () => {
    const metrics = [
      metric("driftsinntekter", 606),
    ];
    const input = "EBITDA|212 180|\nTotal assets|2 692 632|";
    const result = scoreExtraction(metrics, input, true);
    expect(result.missing).toContain("ebitda");
    expect(result.missing).toContain("sum_eiendeler");
    expect(result.score).toBeLessThan(60);
  });

  it("penalizes balance sheet 1000x off", () => {
    const metrics = [
      metric("driftsinntekter", 606),
      metric("driftsresultat", 80),
      metric("ebitda", 212),
      metric("aarsresultat", 57),
      metric("sum_eiendeler", 1.2),  // should be ~1200
      metric("egenkapital", 928),
      metric("total_gjeld", 270),
      metric("operasjonell_kontantstrom", 547),
    ];
    const result = scoreExtraction(metrics, "input", true);
    expect(result.balanceSheetValid).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining("balance sheet"));
  });

  it("validates balance sheet identity within 20%", () => {
    const metrics = [
      metric("sum_eiendeler", 2692),
      metric("egenkapital", 928),
      metric("total_gjeld", 1764),
    ];
    const result = scoreExtraction(metrics, "input", true);
    expect(result.balanceSheetValid).toBe(true);
  });

  it("gives bonus for structured path", () => {
    const metrics = [metric("driftsinntekter", 606)];
    const structured = scoreExtraction(metrics, "input", true);
    const fallback = scoreExtraction(metrics, "input", false);
    expect(structured.score).toBeGreaterThan(fallback.score);
  });

  it("returns score 0 for empty metrics", () => {
    const result = scoreExtraction([], "input with revenue", true);
    expect(result.score).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/quality-scorer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement quality scorer**

Create `lib/quality-scorer.ts`:

```typescript
import { type ExtractedMetric } from "./financial-extractor";

export interface QualityScore {
  score: number;
  missing: string[];
  warnings: string[];
  usedStructuredPath: boolean;
  balanceSheetValid: boolean;
}

const CORE_METRICS = [
  "driftsinntekter",
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
  { metric: "driftsresultat", signal: "operating result" },
  { metric: "ebitda", signal: "ebitda" },
  { metric: "aarsresultat", signal: "profit" },
  { metric: "sum_eiendeler", signal: "total assets" },
  { metric: "egenkapital", signal: "total equity" },
  { metric: "total_gjeld", signal: "total liabilities" },
  { metric: "operasjonell_kontantstrom", signal: "operating activities" },
];

export function scoreExtraction(
  metrics: ExtractedMetric[],
  structuredInput: string,
  usedStructuredPath: boolean
): QualityScore {
  const warnings: string[] = [];
  const extractedNames = new Set(metrics.map((m) => m.metricName));
  let score = 0;

  // +10 per core metric found (max 80)
  for (const name of CORE_METRICS) {
    if (extractedNames.has(name)) score += 10;
  }

  // +10 for structured path
  if (usedStructuredPath) score += 10;

  // Balance sheet identity check
  const assets = metrics.find((m) => m.metricName === "sum_eiendeler");
  const equity = metrics.find((m) => m.metricName === "egenkapital");
  const debt = metrics.find((m) => m.metricName === "total_gjeld");
  let balanceSheetValid = true;

  if (assets && equity && debt && (equity.value + debt.value) !== 0) {
    const expected = equity.value + debt.value;
    const ratio = assets.value / expected;
    if (ratio > 1.2 || ratio < 0.8) {
      balanceSheetValid = false;
      if (ratio > 10 || ratio < 0.1) {
        score -= 20;
        warnings.push(`balance sheet 1000x off: assets=${assets.value}, equity+debt=${expected.toFixed(1)}`);
      } else {
        warnings.push(`balance sheet mismatch: assets=${assets.value}, equity+debt=${expected.toFixed(1)}`);
      }
    }
  }
  if (balanceSheetValid && assets && equity && debt) {
    score += 10;
  }

  // Detect missing metrics that appear in input
  const inputLower = structuredInput.toLowerCase();
  const missing: string[] = [];
  for (const { metric, signal } of METRIC_SIGNALS) {
    if (!extractedNames.has(metric) && inputLower.includes(signal)) {
      missing.push(metric);
      score -= 10;
    }
  }

  return { score, missing, warnings, usedStructuredPath, balanceSheetValid };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/quality-scorer.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/quality-scorer.ts __tests__/quality-scorer.test.ts
git commit -m "feat: add extraction quality scorer"
```

---

### Task 2: Build column hints detector

**Files:**
- Create: `lib/column-hints.ts`
- Create: `__tests__/column-hints.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/column-hints.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectColumnHints } from "../lib/column-hints";

describe("detectColumnHints", () => {
  it("detects column count from data rows", () => {
    const md = `## Income statement

Second quarter Year to date Year

(NOK million) 2025 2024 2025 2024 2024
Operating revenues 1,694 1,709 3,212 3,234 6,385
EBITDA 583 465 997 796 1,632`;
    const hint = detectColumnHints(md);
    expect(hint).not.toBeNull();
    expect(hint).toContain("5");
    expect(hint).toContain("FIRST column");
  });

  it("returns null for pipe-table markdown", () => {
    const md = `## Income statement

|Statement of profit or loss (NOK 1000)|Q4 2025|Q4 2024|
|---|---|---|
|Revenue|606 077|684 809|`;
    const hint = detectColumnHints(md);
    expect(hint).toBeNull();
  });

  it("returns null when no data rows found", () => {
    const md = `Just some text about the company.
No financial data here.`;
    const hint = detectColumnHints(md);
    expect(hint).toBeNull();
  });

  it("handles negative numbers in parentheses", () => {
    const md = `## Income statement

(NOK million) 2025 2024
Operating revenues 1,694 1,709
Costs (139) (149)`;
    const hint = detectColumnHints(md);
    expect(hint).not.toBeNull();
    expect(hint).toContain("2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/column-hints.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement column hints detector**

Create `lib/column-hints.ts`:

```typescript
/**
 * Detect column count and structure in flat-text financial data.
 * Returns a hint string for the LLM, or null if detection fails.
 */
export function detectColumnHints(markdown: string): string | null {
  // Skip if the document has pipe tables (structured path handles those)
  if (markdown.includes("|---|")) return null;

  const lines = markdown.split("\n");

  // Find lines that look like financial data rows: "Label number number..."
  // Numbers can be: 1,694 or -139 or (139) or 6,385 or 1694
  const numberPattern = /(?:-?\d[\d,]*\.?\d*|\(\d[\d,]*\.?\d*\))/g;

  let dataLineCount = 0;
  let columnCount = 0;
  const dataLines: { label: string; numCount: number; lineIdx: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const numbers = line.match(numberPattern);
    if (!numbers || numbers.length < 2) continue;

    // Extract the label (text before the first number)
    const firstNumIdx = line.search(numberPattern);
    const label = line.slice(0, firstNumIdx).trim();

    // Skip lines that look like headers (contain only years/quarters)
    if (!label || /^\d{4}$/.test(label) || /^Q\d/i.test(label)) continue;

    // Skip lines where "numbers" are just years (e.g. "2025 2024 2023")
    if (numbers.every((n) => /^\d{4}$/.test(n.replace(/[(),]/g, "")))) continue;

    dataLines.push({ label, numCount: numbers.length, lineIdx: i });
    dataLineCount++;

    if (dataLineCount >= 3) break;
  }

  if (dataLines.length < 2) return null;

  // Column count = most common number count across data lines
  const counts = dataLines.map((d) => d.numCount);
  columnCount = counts.sort((a, b) =>
    counts.filter((v) => v === b).length - counts.filter((v) => v === a).length
  )[0];

  if (columnCount < 2) return null;

  return `This flat-text report has ${columnCount} value columns per row. Extract from the FIRST column only (current standalone quarter/period). Ignore all other columns — they are comparison periods.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/column-hints.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/column-hints.ts __tests__/column-hints.test.ts
git commit -m "feat: add column count hints for flat-text fallback"
```

---

### Task 3: Add extractWithFeedback to financial-extractor

**Files:**
- Modify: `lib/financial-extractor.ts`

- [ ] **Step 1: Add the feedback extraction function**

Read `lib/financial-extractor.ts`. After the existing `extractFinancialData` function, add:

```typescript
/**
 * Re-extract with feedback about missing metrics.
 * Prepends missing-metric hints to the system prompt.
 */
export async function extractWithFeedback(
  markdown: string,
  missing: string[]
): Promise<ExtractionResult> {
  const { getOpenAI } = await import("./openai");

  const financialContent = prepareStructuredInput(markdown);
  const feedbackNote = `VIKTIG: Forrige ekstraksjonsforsøk manglet disse metrikkene som finnes i inndataen: ${missing.join(", ")}. Sørg for å ekstrahere ALLE tilgjengelige metrikker.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: feedbackNote + "\n\n" + EXTRACTION_PROMPT },
      { role: "user", content: financialContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,  // slight variation from the first attempt
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Empty response from GPT-4o");

  const parsed = JSON.parse(content);
  const period = canonicalizePeriod(parsed.period || "");
  const reportType = parsed.reportType || "annet";
  const currency = parsed.currency || undefined;
  const originalUnit = parsed.originalUnit || undefined;
  const unitEvidence = parsed.unitEvidence || undefined;
  const periodScope = (parsed.periodScope === "cumulative" ? "cumulative" : "standalone") as "standalone" | "cumulative";
  const periodEvidence = parsed.periodEvidence || undefined;

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

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
}
```

Note: `EXTRACTION_PROMPT` is a module-level const already available in the file. `canonicalizePeriod`, `validateMetrics`, and `prepareStructuredInput` are also in the same file.

- [ ] **Step 2: Also export `prepareStructuredInput`'s structured-vs-fallback signal**

Update `prepareStructuredInput` to return whether the structured path was used. Change the function signature:

```typescript
export function prepareStructuredInput(markdown: string): { content: string; usedStructuredPath: boolean } {
  const tables = parseMarkdownTables(markdown);
  const classified = tables.map((table) => ({
    table,
    classification: classifyTable(table),
  }));
  const resolved = resolveUnits(classified);
  const structured = buildStructuredInput(resolved);

  if (!structured) {
    return {
      content: stripCommasOnly(extractFinancialSections(markdown)),
      usedStructuredPath: false,
    };
  }

  return {
    content: stripNumericSeparators(structured),
    usedStructuredPath: true,
  };
}
```

Then update `extractFinancialData` to use the new return type:

```typescript
export async function extractFinancialData(markdown: string): Promise<ExtractionResult> {
  const { getOpenAI } = await import("./openai");

  const { content: financialContent } = prepareStructuredInput(markdown);

  // ... rest stays the same, using financialContent
```

And update `extractWithFeedback` similarly:

```typescript
const { content: financialContent } = prepareStructuredInput(markdown);
```

- [ ] **Step 3: Update existing tests for new return type**

In `__tests__/financial-extractor.test.ts`, the existing tests call `prepareStructuredInput()` and check the string result. Update them to use `.content`:

Find all instances of `prepareStructuredInput(` in the test file and update:
- `const result = prepareStructuredInput(...)` → `const result = prepareStructuredInput(...).content`
- Same for all test assertions

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/financial-extractor.ts __tests__/financial-extractor.test.ts
git commit -m "feat: add extractWithFeedback and return structured path signal"
```

---

### Task 4: Build extraction orchestrator

**Files:**
- Create: `lib/extraction-orchestrator.ts`
- Create: `__tests__/extraction-orchestrator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/extraction-orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { pickBestResult } from "../lib/extraction-orchestrator";
import { type ExtractionResult, type ExtractedMetric } from "../lib/financial-extractor";
import { type QualityScore } from "../lib/quality-scorer";

function metric(name: string, value: number): ExtractedMetric {
  return { metricName: name, value, unit: "MNOK", category: "resultat", confidence: "high" };
}

function makeResult(metrics: ExtractedMetric[], score: number): { result: ExtractionResult; quality: QualityScore } {
  return {
    result: {
      period: "2025-Q2",
      reportType: "kvartalsrapport",
      metrics,
    },
    quality: {
      score,
      missing: [],
      warnings: [],
      usedStructuredPath: true,
      balanceSheetValid: true,
    },
  };
}

describe("pickBestResult", () => {
  it("picks the result with the highest score", () => {
    const attempts = [
      makeResult([metric("driftsinntekter", 100)], 30),
      makeResult([metric("driftsinntekter", 100), metric("ebitda", 50)], 50),
      makeResult([metric("driftsinntekter", 100), metric("ebitda", 50), metric("aarsresultat", 20)], 70),
    ];
    const best = pickBestResult(attempts);
    expect(best.quality.score).toBe(70);
    expect(best.result.metrics).toHaveLength(3);
  });

  it("returns the only result if just one attempt", () => {
    const attempts = [makeResult([metric("driftsinntekter", 100)], 30)];
    const best = pickBestResult(attempts);
    expect(best.quality.score).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/extraction-orchestrator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement extraction orchestrator**

Create `lib/extraction-orchestrator.ts`:

```typescript
import {
  extractFinancialData,
  extractWithFeedback,
  prepareStructuredInput,
  type ExtractionResult,
} from "./financial-extractor";
import { scoreExtraction, type QualityScore } from "./quality-scorer";
import { detectColumnHints } from "./column-hints";
import { convertPdfToMarkdown } from "./pdf-processor";

const QUALITY_THRESHOLD = 60;
const MAX_VOTING_ATTEMPTS = 3;

interface Attempt {
  result: ExtractionResult;
  quality: QualityScore;
}

export function pickBestResult(attempts: Attempt[]): Attempt {
  return attempts.reduce((best, curr) =>
    curr.quality.score > best.quality.score ? curr : best
  );
}

/**
 * Extract financial data with quality-aware retry strategies.
 *
 * Strategies (in escalation order):
 * 1. Retry same prompt (LLM nondeterminism)
 * 2. Re-convert PDF with hybridMode: "full" (if pdfBuffer provided)
 * 3. Retry with feedback about missing metrics
 * 4. Multi-attempt voting (3x, take best)
 */
export async function extractWithRetry(
  markdown: string,
  options?: {
    pdfBuffer?: Buffer;
    historicalMetrics?: { metricName: string; value: number }[];
  }
): Promise<ExtractionResult & { quality: QualityScore }> {
  const attempts: Attempt[] = [];

  // Determine if structured path is used
  const { usedStructuredPath } = prepareStructuredInput(markdown);

  // Add column hints for fallback path
  let workingMarkdown = markdown;
  if (!usedStructuredPath) {
    const hints = detectColumnHints(markdown);
    if (hints) {
      console.log(`[orchestrator] Adding column hints: ${hints.slice(0, 80)}...`);
      // Prepend hints as a comment at the top of the markdown
      workingMarkdown = `[COLUMN STRUCTURE]: ${hints}\n\n${markdown}`;
    }
  }

  // --- Attempt 1: Normal extraction ---
  const result1 = await extractFinancialData(workingMarkdown);
  const { content: inputContent } = prepareStructuredInput(workingMarkdown);
  const quality1 = scoreExtraction(result1.metrics, inputContent, usedStructuredPath);
  attempts.push({ result: result1, quality: quality1 });
  console.log(`[orchestrator] Attempt 1: score=${quality1.score}, metrics=${result1.metrics.length}`);

  if (quality1.score >= QUALITY_THRESHOLD) {
    return { ...result1, quality: quality1 };
  }

  // --- Strategy 1: Simple retry (LLM nondeterminism) ---
  console.log(`[orchestrator] Score ${quality1.score} < ${QUALITY_THRESHOLD}, retrying...`);
  const result2 = await extractFinancialData(workingMarkdown);
  const quality2 = scoreExtraction(result2.metrics, inputContent, usedStructuredPath);
  attempts.push({ result: result2, quality: quality2 });
  console.log(`[orchestrator] Attempt 2 (retry): score=${quality2.score}, metrics=${result2.metrics.length}`);

  if (quality2.score >= QUALITY_THRESHOLD) {
    return { ...result2, quality: quality2 };
  }

  // --- Strategy 2: Re-convert with hybridMode: "full" ---
  if (options?.pdfBuffer && !usedStructuredPath && process.env.DOCLING_SERVE_URL) {
    console.log(`[orchestrator] Retrying with hybridMode: "full"...`);
    try {
      const savedHybridMode = process.env.__HYBRID_MODE_OVERRIDE;
      process.env.__HYBRID_MODE_OVERRIDE = "full";
      const newMarkdown = await convertPdfToMarkdown(options.pdfBuffer);
      process.env.__HYBRID_MODE_OVERRIDE = savedHybridMode;

      const { usedStructuredPath: newStructured } = prepareStructuredInput(newMarkdown);
      const result3 = await extractFinancialData(newMarkdown);
      const { content: newInput } = prepareStructuredInput(newMarkdown);
      const quality3 = scoreExtraction(result3.metrics, newInput, newStructured);
      attempts.push({ result: result3, quality: quality3 });
      console.log(`[orchestrator] Attempt 3 (full hybrid): score=${quality3.score}, metrics=${result3.metrics.length}`);

      if (quality3.score >= QUALITY_THRESHOLD) {
        return { ...result3, quality: quality3 };
      }
    } catch (e) {
      console.warn(`[orchestrator] Full hybrid re-conversion failed:`, (e as Error).message);
    }
  }

  // --- Strategy 3: Retry with feedback ---
  const bestSoFar = pickBestResult(attempts);
  if (bestSoFar.quality.missing.length > 0) {
    console.log(`[orchestrator] Retrying with feedback, missing: ${bestSoFar.quality.missing.join(", ")}`);
    const result4 = await extractWithFeedback(workingMarkdown, bestSoFar.quality.missing);
    const quality4 = scoreExtraction(result4.metrics, inputContent, usedStructuredPath);
    attempts.push({ result: result4, quality: quality4 });
    console.log(`[orchestrator] Attempt 4 (feedback): score=${quality4.score}, metrics=${result4.metrics.length}`);

    if (quality4.score >= QUALITY_THRESHOLD) {
      return { ...result4, quality: quality4 };
    }
  }

  // --- Strategy 4: Multi-attempt voting (take best of 3) ---
  console.log(`[orchestrator] Running ${MAX_VOTING_ATTEMPTS} voting attempts...`);
  for (let i = 0; i < MAX_VOTING_ATTEMPTS; i++) {
    const resultV = await extractFinancialData(workingMarkdown);
    const qualityV = scoreExtraction(resultV.metrics, inputContent, usedStructuredPath);
    attempts.push({ result: resultV, quality: qualityV });
    console.log(`[orchestrator] Vote ${i + 1}: score=${qualityV.score}, metrics=${resultV.metrics.length}`);
  }

  // Return the best result across ALL attempts
  const best = pickBestResult(attempts);
  console.log(`[orchestrator] Final best: score=${best.quality.score}, metrics=${best.result.metrics.length} (from ${attempts.length} attempts)`);
  return { ...best.result, quality: best.quality };
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/extraction-orchestrator.ts __tests__/extraction-orchestrator.test.ts
git commit -m "feat: add extraction orchestrator with quality-aware retry"
```

---

### Task 5: Update pdf-processor for hybridMode override

**Files:**
- Modify: `lib/pdf-processor.ts`

- [ ] **Step 1: Read the current pdf-processor.ts**

Check the current `convert()` call.

- [ ] **Step 2: Add hybridMode override support**

Update the `convert()` options to support the `__HYBRID_MODE_OVERRIDE` env var used by the orchestrator for Strategy 2:

```typescript
await convert([inputPath], {
  outputDir,
  format: "markdown",
  imageOutput: "off",
  contentSafetyOff: "hidden-text",
  ...(process.env.DOCLING_SERVE_URL && {
    hybrid: "docling-fast",
    hybridUrl: process.env.DOCLING_SERVE_URL,
    hybridTimeout: "120000",
    hybridFallback: true,
    ...(process.env.__HYBRID_MODE_OVERRIDE && {
      hybridMode: process.env.__HYBRID_MODE_OVERRIDE,
    }),
  }),
  quiet: true,
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/pdf-processor.ts
git commit -m "feat: support hybridMode override for full-page Docling conversion"
```

---

### Task 6: Add extractionQuality to Convex schema and wire up the upload route

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/documents.ts`
- Modify: `app/api/upload/process/route.ts`

- [ ] **Step 1: Add extractionQuality field to schema**

In `convex/schema.ts`, add to the documents table definition (after `normalizationWarning`):

```typescript
    extractionQuality: v.optional(v.number()),
```

- [ ] **Step 2: Add extractionQuality to updateStatus mutation**

In `convex/documents.ts`, add `extractionQuality` to the `updateStatus` args:

```typescript
    extractionQuality: v.optional(v.number()),
```

- [ ] **Step 3: Update the upload route to use extractWithRetry**

In `app/api/upload/process/route.ts`:

Change the import:
```typescript
// Replace:
import { extractFinancialData } from "@/lib/financial-extractor";
// With:
import { extractWithRetry } from "@/lib/extraction-orchestrator";
```

Update the extraction call (around line 114-115):
```typescript
// Replace:
    extractFinancialData(markdown),
// With:
    extractWithRetry(markdown, { pdfBuffer: pdfData }),
```

Where `pdfData` is the PDF buffer. Check if it's available in scope — it may be the buffer downloaded from R2. Find where `pdfData` or `pdfBuffer` is available and pass it.

Also store the quality score. In the `updateStatus` call (around line 195), add:

```typescript
    extractionQuality: extractionResult.quality.score,
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/documents.ts app/api/upload/process/route.ts
git commit -m "feat: wire up extraction orchestrator and store quality score"
```

---

### Task 7: Verify with real data

- [ ] **Step 1: Deploy Convex functions**

```bash
cd /Users/jonas/Desktop/Projects/finance-test && npx convex dev --once
```

- [ ] **Step 2: Test by uploading a previously failing PDF**

Upload a Vend quarterly report and check:
- Railway logs show orchestrator retry attempts
- More metrics extracted than before
- Quality score stored on document

- [ ] **Step 3: Check quality scores**

```bash
source /Users/jonas/Desktop/Projects/finance-test/.env.local && CONVEX_DEPLOYMENT="dev:quick-chicken-84" npx convex run admin:getMetricsByCompany '{"adminSecret":"'$ADMIN_API_SECRET'","companyId":"js72svxmc043s0p7se4hq4c2kn836gkt"}'
```
