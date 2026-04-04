# Markdown Dedup & Deinterleaving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix scrambled/duplicated financial statements in PDF-to-markdown conversion by adding page separators, deduplication, and deinterleaving.

**Architecture:** Add `markdownPageSeparator` to opendataloader config so pages are explicitly delimited. New `lib/markdown-dedup.ts` post-processor splits by page, deduplicates near-identical pages, and deinterleaves scrambled multi-statement pages using row-label classification. Pipeline calls this before storing/chunking. PDF retained in R2 for re-processing.

**Tech Stack:** TypeScript, @opendataloader/pdf, Convex, Next.js, React

---

### Task 1: Add Page Separator to PDF Conversion

**Files:**
- Modify: `lib/pdf-processor.ts:21-36`

- [ ] **Step 1: Add markdownPageSeparator option**

In `lib/pdf-processor.ts`, add `markdownPageSeparator` to the `convert()` options object:

```typescript
await convert([inputPath], {
  outputDir,
  format: "markdown",
  imageOutput: "off",
  contentSafetyOff: "hidden-text",
  markdownPageSeparator: "---\n<!-- PAGE %page-number% -->\n",
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

- [ ] **Step 2: Commit**

```bash
git add lib/pdf-processor.ts
git commit -m "feat: add page separator to PDF-to-markdown conversion"
```

---

### Task 2: Expand Table Classifier Headings

**Files:**
- Modify: `lib/table-classifier.ts:11-54`
- Modify: `__tests__/table-classifier.test.ts`

- [ ] **Step 1: Write failing tests for new headings**

Add tests to `__tests__/table-classifier.test.ts`:

```typescript
// Add these test cases to the existing test suite

it("classifies IFRS Norwegian income statement headings", () => {
  const table = makeTable({ heading: "Oppstilling over resultat" });
  expect(classifyTable(table)).toBe("income_statement");
});

it("classifies consolidated income statement (konsernresultat)", () => {
  const table = makeTable({ heading: "Konsernresultat" });
  expect(classifyTable(table)).toBe("income_statement");
});

it("classifies combined P&L+OCI heading", () => {
  const table = makeTable({ heading: "Oppstilling over totalresultat" });
  expect(classifyTable(table)).toBe("income_statement");
});

it("classifies IFRS Norwegian balance sheet heading", () => {
  const table = makeTable({ heading: "Oppstilling over finansiell stilling" });
  expect(classifyTable(table)).toBe("balance_sheet");
});

it("classifies consolidated balance sheet (konsernbalanse)", () => {
  const table = makeTable({ heading: "Konsernbalanse" });
  expect(classifyTable(table)).toBe("balance_sheet");
});

it("classifies IFRS Norwegian cash flow heading", () => {
  const table = makeTable({ heading: "Oppstilling over kontantstrømmer" });
  expect(classifyTable(table)).toBe("cash_flow");
});

it("classifies consolidated cash flow heading", () => {
  const table = makeTable({ heading: "Konsernets kontantstrømoppstilling" });
  expect(classifyTable(table)).toBe("cash_flow");
});
```

Note: check the existing test file for the `makeTable` helper. If it doesn't exist, create a minimal helper that produces a `ParsedTable` with the given heading, empty headerRow, and empty rows.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/table-classifier.test.ts`
Expected: 7 new tests FAIL

- [ ] **Step 3: Add new headings to classifier**

In `lib/table-classifier.ts`, expand the heading arrays:

```typescript
const INCOME_HEADING = [
  "profit or loss",
  "resultatregnskap",
  "income statement",
  "comprehensive income",
  "profit and loss",
  "oppstilling over resultat",
  "oppstilling over totalresultat",
  "konsernresultat",
  "konsernresultatregnskap",
];

const BALANCE_HEADING = [
  "financial position",
  "balanse",
  "balance sheet",
  "oppstilling over finansiell stilling",
  "konsernbalanse",
];

const CASHFLOW_HEADING = [
  "cash flow",
  "kontantstrøm",
  "kontantstrømoppstilling",
  "oppstilling over kontantstrømmer",
  "konsernets kontantstrømoppstilling",
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/table-classifier.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/table-classifier.ts __tests__/table-classifier.test.ts
git commit -m "feat: add IFRS Norwegian headings to table classifier"
```

---

### Task 3: Create Markdown Dedup Module

**Files:**
- Create: `lib/markdown-dedup.ts`
- Create: `__tests__/markdown-dedup.test.ts`

This is the largest task. It has three sub-parts: page splitting, deduplication, and deinterleaving.

#### Part A: Page Splitting

- [ ] **Step 1: Write failing test for page splitting**

Create `__tests__/markdown-dedup.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deduplicateMarkdown } from "../lib/markdown-dedup";

describe("deduplicateMarkdown", () => {
  describe("page splitting", () => {
    it("returns input unchanged when no page markers exist", () => {
      const input = "# Some heading\n\nSome content\n";
      expect(deduplicateMarkdown(input)).toBe(input);
    });

    it("preserves content with page markers but no issues", () => {
      const input = [
        "# Revenue Report",
        "---",
        "<!-- PAGE 1 -->",
        "Some unique content on page 1",
        "---",
        "<!-- PAGE 2 -->",
        "Completely different content on page 2",
      ].join("\n");
      const result = deduplicateMarkdown(input);
      expect(result).toContain("content on page 1");
      expect(result).toContain("content on page 2");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/markdown-dedup.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement page splitting skeleton**

Create `lib/markdown-dedup.ts`:

```typescript
interface Page {
  pageNumber: number;
  content: string;
}

const PAGE_MARKER_RE = /<!-- PAGE (\d+) -->/;

function splitByPages(markdown: string): Page[] {
  const parts = markdown.split(/---\n<!-- PAGE (\d+) -->\n/);
  // parts[0] is content before first marker (preamble)
  // parts[1] is page number, parts[2] is content, parts[3] is page number, ...
  if (parts.length < 3) {
    return [{ pageNumber: 0, content: markdown }];
  }

  const pages: Page[] = [];

  // Include preamble (content before first page marker) if non-empty
  const preamble = parts[0].trim();
  if (preamble) {
    pages.push({ pageNumber: 0, content: preamble });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const pageNumber = parseInt(parts[i], 10);
    const content = parts[i + 1] ?? "";
    pages.push({ pageNumber, content });
  }

  return pages;
}

function reassemble(pages: Page[]): string {
  return pages
    .map((p) =>
      p.pageNumber === 0
        ? p.content
        : `---\n<!-- PAGE ${p.pageNumber} -->\n${p.content}`
    )
    .join("");
}

export function deduplicateMarkdown(markdown: string): string {
  // No page markers — return unchanged
  if (!PAGE_MARKER_RE.test(markdown)) {
    return markdown;
  }

  const pages = splitByPages(markdown);

  // Phase 2: deduplicate (next step)
  // Phase 3: deinterleave (next step)

  return reassemble(pages);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/markdown-dedup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/markdown-dedup.ts __tests__/markdown-dedup.test.ts
git commit -m "feat: add markdown-dedup module with page splitting"
```

#### Part B: Deduplication

- [ ] **Step 6: Write failing test for deduplication**

Add to `__tests__/markdown-dedup.test.ts`:

```typescript
describe("deduplication", () => {
  it("removes duplicate pages with >80% line overlap", () => {
    const sharedLines = Array.from(
      { length: 10 },
      (_, i) => `| Row ${i} | ${i * 100} | ${i * 90} |`
    ).join("\n");

    const input = [
      "---",
      "<!-- PAGE 1 -->",
      "# Resultatregnskap\n",
      sharedLines,
      "\n---",
      "<!-- PAGE 2 -->",
      "# Resultatregnskap\n",
      sharedLines,
      "\n| Extra row | 999 | 888 |",
    ].join("\n");

    const result = deduplicateMarkdown(input);
    // Should keep the page with more content (page 2 has the extra row)
    expect(result).toContain("Extra row");
    // Should only have one copy of the shared content
    const matches = result.match(/Row 0/g);
    expect(matches).toHaveLength(1);
  });

  it("does not deduplicate pages with <80% overlap", () => {
    const input = [
      "---",
      "<!-- PAGE 1 -->",
      "# Resultatregnskap\n",
      "| Revenue | 1000 |",
      "\n---",
      "<!-- PAGE 2 -->",
      "# Balanse\n",
      "| Total assets | 5000 |",
    ].join("\n");

    const result = deduplicateMarkdown(input);
    expect(result).toContain("Revenue");
    expect(result).toContain("Total assets");
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run __tests__/markdown-dedup.test.ts`
Expected: dedup test FAILS (pages not being deduplicated yet)

- [ ] **Step 8: Implement deduplication**

Add to `lib/markdown-dedup.ts`:

```typescript
function normalizeLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((line) => setB.has(line)).length;
  return shared / Math.min(a.length, b.length);
}

function deduplicatePages(pages: Page[]): Page[] {
  const dominated = new Set<number>(); // indices to remove

  for (let i = 0; i < pages.length; i++) {
    if (dominated.has(i)) continue;
    const linesI = normalizeLines(pages[i].content);

    for (let j = i + 1; j < pages.length; j++) {
      if (dominated.has(j)) continue;
      const linesJ = normalizeLines(pages[j].content);

      if (overlapRatio(linesI, linesJ) > 0.8) {
        // Keep the page with more content
        if (linesI.length >= linesJ.length) {
          dominated.add(j);
        } else {
          dominated.add(i);
          break; // i is dominated, stop comparing it
        }
      }
    }
  }

  return pages.filter((_, idx) => !dominated.has(idx));
}
```

Update `deduplicateMarkdown` to call `deduplicatePages`:

```typescript
export function deduplicateMarkdown(markdown: string): string {
  if (!PAGE_MARKER_RE.test(markdown)) {
    return markdown;
  }

  let pages = splitByPages(markdown);
  pages = deduplicatePages(pages);
  // Phase 3: deinterleave (next step)
  return reassemble(pages);
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run __tests__/markdown-dedup.test.ts`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git add lib/markdown-dedup.ts __tests__/markdown-dedup.test.ts
git commit -m "feat: add page deduplication to markdown-dedup"
```

#### Part C: Deinterleaving

- [ ] **Step 11: Write failing test for deinterleaving**

Add to `__tests__/markdown-dedup.test.ts`:

```typescript
describe("deinterleaving", () => {
  it("separates interleaved P&L and balance sheet rows", () => {
    const input = [
      "---",
      "<!-- PAGE 1 -->",
      "| Driftsinntekter | 1000 | 900 |",
      "| Sum eiendeler | 5000 | 4500 |",
      "| Varekostnad | 400 | 350 |",
      "| Egenkapital | 2000 | 1800 |",
      "| Driftsresultat | 200 | 180 |",
      "| Total gjeld | 3000 | 2700 |",
    ].join("\n");

    const result = deduplicateMarkdown(input);
    const lines = result.split("\n").filter((l) => l.trim().length > 0);

    // Find positions of key rows
    const revenueIdx = lines.findIndex((l) => l.includes("Driftsinntekter"));
    const cogsIdx = lines.findIndex((l) => l.includes("Varekostnad"));
    const ebitIdx = lines.findIndex((l) => l.includes("Driftsresultat"));
    const assetsIdx = lines.findIndex((l) => l.includes("Sum eiendeler"));
    const equityIdx = lines.findIndex((l) => l.includes("Egenkapital"));
    const debtIdx = lines.findIndex((l) => l.includes("Total gjeld"));

    // P&L rows should be grouped together (contiguous, before BS rows)
    expect(revenueIdx).toBeLessThan(cogsIdx);
    expect(cogsIdx).toBeLessThan(ebitIdx);

    // BS rows should be grouped together
    expect(assetsIdx).toBeLessThan(equityIdx);
    expect(equityIdx).toBeLessThan(debtIdx);

    // P&L block should come before BS block (canonical order)
    expect(ebitIdx).toBeLessThan(assetsIdx);
  });

  it("skips deinterleaving when confidence is below 60%", () => {
    const input = [
      "---",
      "<!-- PAGE 1 -->",
      "| Some random row | 100 |",
      "| Another random row | 200 |",
      "| Unknown data | 300 |",
      "| Driftsinntekter | 1000 |",
      "| More random stuff | 400 |",
    ].join("\n");

    const result = deduplicateMarkdown(input);
    // With only 1 out of 5 rows classified, confidence is 20% — should skip
    // Output should preserve original order
    const lines = result.split("\n").filter((l) => l.includes("|"));
    expect(lines[0]).toContain("Some random row");
    expect(lines[3]).toContain("Driftsinntekter");
  });

  it("handles pages with only one statement type (no-op)", () => {
    const input = [
      "---",
      "<!-- PAGE 1 -->",
      "# Resultatregnskap",
      "| Driftsinntekter | 1000 |",
      "| Varekostnad | 400 |",
      "| Driftsresultat | 200 |",
    ].join("\n");

    const result = deduplicateMarkdown(input);
    expect(result).toContain("Driftsinntekter");
    expect(result).toContain("Varekostnad");
    expect(result).toContain("Driftsresultat");
  });
});
```

- [ ] **Step 12: Run tests to verify they fail**

Run: `npx vitest run __tests__/markdown-dedup.test.ts`
Expected: deinterleaving tests FAIL

- [ ] **Step 13: Implement deinterleaving**

Add to `lib/markdown-dedup.ts`:

```typescript
type StatementType = "income_statement" | "balance_sheet" | "cash_flow" | null;

const CANONICAL_ORDER: StatementType[] = [
  "income_statement",
  "balance_sheet",
  "cash_flow",
];

const IS_KEYWORDS = [
  "driftsinntekter", "salgsinntekt", "varekostnad", "lønnskostnad",
  "driftsresultat", "ebitda", "finansinntekter", "finanskostnader",
  "resultat før skatt", "skattekostnad", "årsresultat", "periodens resultat",
  "revenue", "cost of goods", "gross profit", "operating profit",
  "earnings per share", "profit before tax", "income tax", "net income",
  "employee benefit", "personalkostnader", "andre driftskostnader",
  "other operating expense", "profit for the period",
];

const BS_KEYWORDS = [
  "eiendeler", "anleggsmidler", "omløpsmidler", "egenkapital",
  "gjeld", "goodwill", "varige driftsmidler", "kundefordringer",
  "leverandørgjeld", "sum eiendeler", "total assets", "total equity",
  "total liabilities", "inventories", "trade receivables",
  "share capital", "retained earnings", "cash and cash equivalents",
  "kontanter", "immaterielle eiendeler", "bruksrettseiendeler",
  "financial position", "balanse",
];

const CF_KEYWORDS = [
  "kontantstrøm fra", "driftsaktiviteter", "investeringsaktiviteter",
  "finansieringsaktiviteter", "netto endring", "operating activities",
  "investing activities", "financing activities", "net change in cash",
  "free cash flow", "cash generated", "kontantstrøm",
];

function classifyLine(line: string): StatementType {
  const lower = line.toLowerCase();
  if (IS_KEYWORDS.some((kw) => lower.includes(kw))) return "income_statement";
  if (BS_KEYWORDS.some((kw) => lower.includes(kw))) return "balance_sheet";
  if (CF_KEYWORDS.some((kw) => lower.includes(kw))) return "cash_flow";
  return null;
}

function deinterleavePage(content: string): string {
  const lines = content.split("\n");
  const classifications: (StatementType)[] = lines.map((l) => classifyLine(l));

  // Count how many distinct statement types appear
  const types = new Set(classifications.filter((c) => c !== null));
  if (types.size < 2) return content; // single type or unclassified — no-op

  // Check confidence: what fraction of non-empty lines were classified?
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  const classifiedCount = classifications.filter((c) => c !== null).length;
  if (nonEmptyLines.length > 0 && classifiedCount / nonEmptyLines.length < 0.6) {
    return content; // below confidence threshold — skip
  }

  // Propagate classifications: unclassified lines inherit from nearest preceding
  let lastClassification: StatementType = null;
  for (let i = 0; i < classifications.length; i++) {
    if (classifications[i] !== null) {
      lastClassification = classifications[i];
    } else if (lastClassification !== null && lines[i].trim().length > 0) {
      classifications[i] = lastClassification;
    }
  }

  // Group lines by statement type, preserving relative order within each type
  const buckets: Record<string, string[]> = {
    income_statement: [],
    balance_sheet: [],
    cash_flow: [],
  };
  const unclassified: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cls = classifications[i];
    if (cls && buckets[cls]) {
      buckets[cls].push(lines[i]);
    } else {
      unclassified.push(lines[i]);
    }
  }

  // Reassemble in canonical order
  const result: string[] = [];
  for (const type of CANONICAL_ORDER) {
    if (type && buckets[type].length > 0) {
      result.push(...buckets[type]);
    }
  }
  // Append any unclassified lines at the end
  result.push(...unclassified);

  return result.join("\n");
}

function deinterleavePages(pages: Page[]): Page[] {
  return pages.map((page) => ({
    ...page,
    content: deinterleavePage(page.content),
  }));
}
```

Update `deduplicateMarkdown` to call `deinterleavePages`:

```typescript
export function deduplicateMarkdown(markdown: string): string {
  if (!PAGE_MARKER_RE.test(markdown)) {
    return markdown;
  }

  let pages = splitByPages(markdown);
  pages = deduplicatePages(pages);
  pages = deinterleavePages(pages);
  return reassemble(pages);
}
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run __tests__/markdown-dedup.test.ts`
Expected: All PASS

- [ ] **Step 15: Commit**

```bash
git add lib/markdown-dedup.ts __tests__/markdown-dedup.test.ts
git commit -m "feat: add deinterleaving to markdown-dedup"
```

---

### Task 4: Wire Dedup Into Processing Pipeline

**Files:**
- Modify: `app/api/upload/process/route.ts:1-10,97-99,190-213`

- [ ] **Step 1: Import and call deduplicateMarkdown**

In `app/api/upload/process/route.ts`, add the import at the top:

```typescript
import { deduplicateMarkdown } from "@/lib/markdown-dedup";
```

Then in `doProcessing()`, after the PDF-to-markdown conversion (line 99), add the dedup call:

```typescript
// 4. Convert PDF to Markdown
console.log(`Processing ${docId}: converting PDF to markdown`);
const rawMarkdown = await convertPdfToMarkdown(pdfBuffer);

// 4b. Deduplicate and deinterleave
console.log(`Processing ${docId}: deduplicating markdown`);
const markdown = deduplicateMarkdown(rawMarkdown);
```

- [ ] **Step 2: Remove PDF deletion from R2**

In the same file, remove line 191:

```typescript
// DELETE THIS LINE:
await deleteObject(r2Key);
```

And in the `updateStatus` call (around line 212), remove `clearR2Key: true`:

```typescript
// REMOVE clearR2Key from this call:
await convex.mutation(api.documents.updateStatus, {
  id: docId,
  status: "ready",
  markdownFileId: mdStorageId,
  period: extractionResult.period,
  reportType: extractionResult.reportType ?? "annet",
  currency: extractionResult.currency,
  originalUnit: extractionResult.originalUnit,
  unitEvidence: extractionResult.unitEvidence,
  periodScope: extractionResult.periodScope,
  periodEvidence: extractionResult.periodEvidence,
  normalizationWarning,
  extractionQuality: extractionResult.quality?.score,
  ...(standardizedName ? { fileName: standardizedName } : {}),
  // clearR2Key: true  ← REMOVE THIS
});
```

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/process/route.ts
git commit -m "feat: wire markdown dedup into processing pipeline, keep PDF in R2"
```

---

### Task 5: Add Re-Process Backend

**Files:**
- Modify: `convex/documents.ts`
- Modify: `app/api/upload/process/route.ts`
- Modify: `convex/chunks.ts`

- [ ] **Step 1: Add resetForReprocessing mutation to Convex**

Add to `convex/documents.ts`:

```typescript
export const resetForReprocessing = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Dokument ikke funnet");

    // Admin or owner check
    const identity = await ctx.auth.getUserIdentity();
    const adminEmails = ["s2419213@bi.no"];
    const isAdmin = identity?.email && adminEmails.includes(identity.email);
    if (!isAdmin && doc.uploadedBy && doc.uploadedBy !== userId) {
      throw new Error("Ingen tilgang");
    }

    if (!doc.r2Key) throw new Error("PDF ikke tilgjengelig for re-prosessering");

    // Delete existing chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete existing metrics
    const metrics = await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", doc.companyId))
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .collect();
    for (const metric of metrics) {
      await ctx.db.delete(metric._id);
    }

    // Delete old markdown file
    if (doc.markdownFileId) {
      await ctx.storage.delete(doc.markdownFileId);
    }

    // Reset status
    await ctx.db.patch(args.id, {
      status: "processing",
      markdownFileId: undefined,
      extractionQuality: undefined,
      normalizationWarning: undefined,
      errorMessage: undefined,
    });

    return { r2Key: doc.r2Key, companyId: doc.companyId };
  },
});
```

- [ ] **Step 2: Add re-process support to the process route**

In `app/api/upload/process/route.ts`, update the POST handler to accept a `reprocess` flag. Modify the `POST` function:

```typescript
export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const { docId, reprocess } = (await req.json()) as {
      docId: string;
      reprocess?: boolean;
    };
    if (!docId) {
      return NextResponse.json(
        { error: "docId is required" },
        { status: 400 }
      );
    }

    const typedDocId = docId as Id<"documents">;

    if (reprocess) {
      // Re-process: reset document and re-run pipeline
      const { r2Key, companyId } = await convex.mutation(
        api.documents.resetForReprocessing,
        { id: typedDocId }
      );

      enqueueProcessing(() =>
        processInBackground(convex, typedDocId, companyId, r2Key)
      );

      return NextResponse.json({ docId, status: "reprocessing" });
    }

    // Original upload flow
    const doc = await convex.query(api.documents.get, { id: typedDocId });
    if (!doc) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }
    if (doc.status !== "uploading" || !doc.r2Key) {
      return NextResponse.json(
        { error: "Dokumentet er ikke klart for prosessering" },
        { status: 400 }
      );
    }

    await convex.mutation(api.documents.updateStatus, {
      id: typedDocId,
      status: "processing",
    });

    const r2Key = doc.r2Key;

    enqueueProcessing(() =>
      processInBackground(convex, typedDocId, doc.companyId, r2Key)
    );

    return NextResponse.json({ docId, status: "processing" });
  } catch {
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts app/api/upload/process/route.ts
git commit -m "feat: add re-process backend (reset mutation + route support)"
```

---

### Task 6: Add Re-Process Button to UI

**Files:**
- Modify: `components/dashboard/documents-tab.tsx`

- [ ] **Step 1: Add re-process handler and button**

In `components/dashboard/documents-tab.tsx`:

Import `ArrowsClockwise` from phosphor-icons (at the top, alongside existing imports):

```typescript
import { DownloadSimple, Trash, Warning, ArrowsClockwise } from "@phosphor-icons/react";
```

Add state and handler inside the `DocumentsTab` component, after the existing state declarations:

```typescript
const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());

const handleReprocess = async (docId: Id<"documents">) => {
  setReprocessingIds((prev) => new Set(prev).add(docId));
  try {
    await fetch("/api/upload/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, reprocess: true }),
    });
  } finally {
    // Status will update via Convex reactivity — just clear the local spinner after a short delay
    setTimeout(() => {
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }, 2000);
  }
};
```

Then in the table row, add the re-process button next to the delete button (inside the last `<td>`). The button should only show for documents that have status `"ready"` or `"error"` and have an `r2Key`:

```typescript
<td className="py-3 px-4 text-right flex items-center justify-end gap-2">
  {(isAdmin || doc.uploadedBy === currentUserId) && doc.r2Key && (
    <button
      onClick={() => handleReprocess(doc._id)}
      disabled={reprocessingIds.has(doc._id) || doc.status === "processing"}
      className="text-[#666666] hover:text-accent transition-colors duration-150 disabled:opacity-30"
      title="Re-prosesser"
    >
      <ArrowsClockwise
        size={16}
        className={reprocessingIds.has(doc._id) ? "animate-spin" : ""}
      />
    </button>
  )}
  {(isAdmin || doc.uploadedBy === currentUserId) && (
    <button
      onClick={() => removeDocument({ id: doc._id })}
      className="text-[#666666] hover:text-negative transition-colors duration-150"
    >
      <Trash size={16} />
    </button>
  )}
</td>
```

Note: The document type in the `map()` callback needs `r2Key` added:

```typescript
{documents.map((doc: { _id: Id<"documents">; fileName: string; reportType: string; period: string; status: string; uploadedBy?: string; markdownUrl?: string | null; r2Key?: string }) => (
```

- [ ] **Step 2: Verify the `listByCompany` query returns `r2Key`**

Check `convex/documents.ts` — the `listByCompany` query returns `...d` (full document spread), which includes `r2Key` when it exists. No changes needed.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/documents-tab.tsx
git commit -m "feat: add re-process button to document list"
```

---

### Task 7: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Upload a quarterly report PDF known to have facing-page spreads**

Upload via the UI and observe:
- The stored markdown should have `<!-- PAGE N -->` markers
- Duplicated statements should appear only once
- Interleaved P&L/BS content should be separated

- [ ] **Step 3: Test re-process button**

Click the re-process button on an existing document. Verify:
- Status changes to "Prosesserer..."
- After completion, status returns to "Klar"
- Markdown is updated with page separators and dedup applied

- [ ] **Step 4: Test with a well-behaved annual report**

Upload a normal annual report (one statement per page). Verify:
- No content is removed or reordered (dedup is a no-op)
- Page separators are present but content is identical to pre-change behavior
