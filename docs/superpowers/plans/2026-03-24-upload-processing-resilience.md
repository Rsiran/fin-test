# Upload Processing Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Java OOM, prevent documents from getting stuck in "processing", and speed up stale cleanup.

**Architecture:** Fix the JVM heap cap at its source (Dockerfile), refactor the process route into a fire-and-forget pattern with a 10-minute timeout, update the client to handle the async response, and reduce the stale cleanup threshold from 24h to 2h.

**Tech Stack:** Next.js API routes, Convex (DB/mutations), Cloudflare R2, `@opendataloader/pdf` (Java-based PDF converter), OpenAI embeddings API.

**Spec:** `docs/superpowers/specs/2026-03-24-upload-processing-resilience-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `Dockerfile:30` | Modify | Change `-Xmx512m` to `-Xmx4g` |
| `app/api/upload/process/route.ts` | Rewrite | Split into validation (sync) + `processInBackground` (async with timeout) |
| `components/upload-context.tsx:136-145` | Modify | Treat `"processing"` response as successful handoff |
| `convex/cleanup.ts:4` | Modify | Change threshold constant from 24h to 2h |

---

### Task 1: Fix Java Heap in Dockerfile

**Files:**
- Modify: `Dockerfile:30`

- [ ] **Step 1: Update the JVM heap limit**

In `Dockerfile`, change line 30 from:
```dockerfile
ENV _JAVA_OPTIONS="-Xmx512m"
```
to:
```dockerfile
ENV _JAVA_OPTIONS="-Xmx4g"
```

- [ ] **Step 2: Update the comment on line 28**

Change the comment to reflect the new intent:
```dockerfile
# Allow Java up to 4 GB heap for large PDF processing (300+ page reports)
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "fix: increase JVM heap from 512m to 4g for large PDF processing"
```

---

### Task 2: Refactor Process Route to Fire-and-Forget

**Files:**
- Rewrite: `app/api/upload/process/route.ts`

**Note:** This is a full rewrite. Retain all existing imports from the current file — no new imports are needed. The file has three new functions (`timeoutPromise`, `processInBackground`, `doProcessing`) plus the simplified `POST` handler.

- [ ] **Step 1: Extract `processInBackground` function**

`processInBackground` wraps the heavy work in a `Promise.race` timeout and handles errors. If anything fails (including timeout), it sets the document to `"error"` status. Temp files are cleaned up in the `finally` block regardless.

```typescript
// Must stay well below auth token TTL (~1h). See spec Section 4.
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Prosessering tidsavbrutt (>10 min)")), ms)
  );
}

async function processInBackground(
  convex: ConvexHttpClient,
  docId: Id<"documents">,
  companyId: Id<"companies">,
  r2Key: string
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "r2-download-"));

  try {
    await Promise.race([
      doProcessing(convex, docId, companyId, r2Key, tempDir),
      timeoutPromise(PROCESSING_TIMEOUT_MS),
    ]);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Processing failed for ${docId}:`, errorMessage);
    try {
      await convex.mutation(api.documents.updateStatus, {
        id: docId,
        status: "error",
        errorMessage,
      });
    } catch {
      // Last resort — stale cleanup will catch this
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Extract `doProcessing` function**

`doProcessing` is the actual PDF-to-embeddings pipeline extracted from the current route (download from R2, convert to markdown, chunk, generate embeddings via OpenAI, store metrics). It's a separate function so `Promise.race` can wrap it cleanly. **Note:** On timeout, `Promise.race` resolves but `doProcessing` and its Java child process may continue running briefly — this is a known limitation (see spec Section 4).

```typescript
async function doProcessing(
  convex: ConvexHttpClient,
  docId: Id<"documents">,
  companyId: Id<"companies">,
  r2Key: string,
  tempDir: string
): Promise<void> {
  const pdfPath = join(tempDir, "input.pdf");
  await downloadToFile(r2Key, pdfPath);
  const pdfBuffer = await readFile(pdfPath);

  console.log(`Processing ${docId}: converting PDF to markdown`);
  const markdown = await convertPdfToMarkdown(pdfBuffer);

  // Store markdown in Convex file storage
  const mdUploadUrl = await convex.mutation(api.documents.generateUploadUrl);
  const mdUploadResponse = await fetch(mdUploadUrl, {
    method: "POST",
    headers: { "Content-Type": "text/markdown" },
    body: markdown,
  });
  const { storageId: mdStorageId } = await mdUploadResponse.json();

  // Run extraction and chunking in parallel
  console.log(`Processing ${docId}: extracting metrics and chunking`);
  const [extractionResult, chunks] = await Promise.all([
    extractFinancialData(markdown),
    Promise.resolve(chunkMarkdown(markdown)),
  ]);

  // Generate embeddings for all chunks
  console.log(`Processing ${docId}: generating embeddings for ${chunks.length} chunks`);
  const embeddings = await generateEmbeddings(
    chunks.map((c) => c.content)
  );

  // Store chunks with embeddings
  for (let i = 0; i < chunks.length; i++) {
    await convex.mutation(api.chunks.insert, {
      documentId: docId,
      companyId,
      content: chunks[i].content,
      embedding: embeddings[i],
      chunkIndex: chunks[i].chunkIndex,
    });
  }

  // Cross-period magnitude check
  let normalizationWarning: string | undefined;
  const newRevenue = extractionResult.metrics.find(
    (m) => m.metricName === "driftsinntekter"
  );
  if (newRevenue) {
    try {
      const existingRevenue = await convex.query(
        api.financialMetrics.getByCompanyAndMetric,
        { companyId, metricName: "driftsinntekter" }
      );
      if (existingRevenue.length > 0) {
        const latest = existingRevenue.sort((a, b) =>
          b.period.localeCompare(a.period)
        )[0];
        if (latest.value !== 0) {
          const ratio = newRevenue.value / latest.value;
          if (ratio > 10 || ratio < 0.1) {
            normalizationWarning =
              `Mulig enhetsfeil: ${extractionResult.period} driftsinntekter ` +
              `(${newRevenue.value} ${newRevenue.unit}) er ${ratio.toFixed(1)}x ` +
              `av ${latest.period} (${latest.value} ${latest.unit}). ` +
              `Detektert originalUnit: "${extractionResult.originalUnit ?? "ukjent"}". ` +
              `Bevis: "${extractionResult.unitEvidence ?? "ingen"}"`;
            console.warn("MAGNITUDE CHECK FAILED:", normalizationWarning);
          }
        }
      }
    } catch (e) {
      console.warn("Magnitude check error:", e);
    }
  }

  // Store financial metrics
  if (extractionResult.metrics.length > 0) {
    await convex.mutation(api.financialMetrics.insertBatch, {
      metrics: extractionResult.metrics.map((m) => ({
        documentId: docId,
        companyId,
        period: extractionResult.period,
        category: m.category,
        metricName: m.metricName,
        value: m.value,
        unit: m.unit,
      })),
    });
  }

  // Delete PDF from R2 (best-effort)
  await deleteObject(r2Key);

  // Update document status to ready
  console.log(`Processing ${docId}: complete`);
  await convex.mutation(api.documents.updateStatus, {
    id: docId,
    status: "ready",
    markdownFileId: mdStorageId,
    period: extractionResult.period,
    reportType: extractionResult.reportType ?? "annet",
    currency: extractionResult.currency,
    originalUnit: extractionResult.originalUnit,
    unitEvidence: extractionResult.unitEvidence,
    normalizationWarning,
    clearR2Key: true,
  });
}
```

- [ ] **Step 3: Simplify the `POST` handler**

Replace the current `POST` handler body. The route now only does validation + kicks off background work:

```typescript
export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const { docId } = (await req.json()) as { docId: string };
    if (!docId) {
      return NextResponse.json(
        { error: "docId is required" },
        { status: 400 }
      );
    }

    const typedDocId = docId as Id<"documents">;

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

    // Set status to "processing"
    await convex.mutation(api.documents.updateStatus, {
      id: typedDocId,
      status: "processing",
    });

    // Capture r2Key after the guard — guaranteed to be defined here
    const r2Key = doc.r2Key;

    // Fire and forget — processing runs in background
    processInBackground(convex, typedDocId, doc.companyId, r2Key).catch(
      () => {} // errors handled inside processInBackground
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

- [ ] **Step 4: Verify the complete file compiles**

Run: `npx tsc --noEmit 2>&1 | grep "upload/process"`
Expected: No errors for this file.

- [ ] **Step 5: Commit**

```bash
git add app/api/upload/process/route.ts
git commit -m "fix: refactor process route to fire-and-forget with 10min timeout"
```

---

### Task 3: Update Client to Handle Async Response

**Files:**
- Modify: `components/upload-context.tsx:136-145`

**Note:** Tasks 2 and 3 must be deployed together — the new client expects `"processing"` responses that only the new route produces.

- [ ] **Step 1: Update the process response handler**

In `components/upload-context.tsx`, replace lines 136-145 (the `processData` handling block inside `handleFiles`). Do NOT modify line 130 (`updateResult(id, { status: "processing" })`) — that is the status update *before* calling the process route and is unrelated.

From:
```typescript
          const processData = await processRes.json();

          if (processData.status === "ready") {
            updateResult(id, { status: "ready" });
          } else {
            updateResult(id, {
              status: "error",
              error: processData.error || "Prosessering feilet",
            });
          }
```

To:
```typescript
          const processData = await processRes.json();

          if (processData.status === "ready" || processData.status === "processing") {
            updateResult(id, { status: processData.status });
          } else {
            updateResult(id, {
              status: "error",
              error: processData.error || "Prosessering feilet",
            });
          }
```

The only change: `"processing"` is now treated as a successful handoff. The local upload result stays at `"processing"` and the Convex reactive query in `DocumentsTab` updates automatically when the background function sets the final status.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "upload-context"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/upload-context.tsx
git commit -m "fix: treat processing response as successful handoff in upload context"
```

---

### Task 4: Reduce Stale Cleanup Threshold

**Files:**
- Modify: `convex/cleanup.ts:4`

- [ ] **Step 1: Change the threshold constant**

In `convex/cleanup.ts`, change line 4 from:
```typescript
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
```
to:
```typescript
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
```

- [ ] **Step 2: Push Convex functions**

Run: `npx convex dev --once`
Expected: `Convex functions ready!`

- [ ] **Step 3: Commit**

```bash
git add convex/cleanup.ts
git commit -m "fix: reduce stale document cleanup threshold from 24h to 2h"
```

---

### Task 5: Clean Up Stuck Documents

**Files:**
- Create (temporary): `convex/admin.ts`

- [ ] **Step 1: Create temporary admin functions**

Create `convex/admin.ts` with two internal functions:
- `findDocuments` — internal query that lists all documents (with optional filename filter)
- `deleteDocument` — internal mutation that deletes a document + its orphaned chunks/metrics/storage (same cascade pattern as `cleanup.deleteStaleDocument`)

- [ ] **Step 2: Push and identify stuck documents**

Run: `npx convex dev --once`

Then find stuck Cadeler documents:
```bash
npx convex run admin:findDocuments '{}'
```

Look for documents with `status: "error"` or `status: "processing"` that belong to Cadeler (`companyId: js7c1mqg6x9fgjvc8j2jfdh825835zrd`).

- [ ] **Step 3: Delete each stuck document**

For each stuck document ID:
```bash
npx convex run admin:deleteDocument '{"documentId": "<id>"}'
```

- [ ] **Step 4: Remove admin file and push**

```bash
rm convex/admin.ts
npx convex dev --once
```

- [ ] **Step 5: Commit** (only if there were code changes to commit — the admin file is transient)

No commit needed — the admin file was temporary and already removed.

---

### Task 6: Final Verification

- [ ] **Step 1: Type-check the project**

Run: `npx tsc --noEmit 2>&1 | grep -E "(upload|cleanup|Dockerfile)" || echo "No errors in changed files"`
Expected: No errors in changed files.

- [ ] **Step 2: Push Convex functions**

Run: `npx convex dev --once`
Expected: `Convex functions ready!`

- [ ] **Step 3: Create final commit and push**

```bash
git push
```
