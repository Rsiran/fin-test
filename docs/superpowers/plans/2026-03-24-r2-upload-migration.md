# R2 Upload Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Convex storage PDF uploads with Cloudflare R2 presigned URL uploads so files up to 100MB work reliably.

**Architecture:** Browser uploads PDFs directly to R2 via presigned PUT URL, then triggers server-side processing. Server streams PDF from R2 to temp file, runs existing pipeline (markdown/chunks/embeddings/metrics), deletes PDF from R2. Markdown stays in Convex storage.

**Tech Stack:** Cloudflare R2, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, Next.js API routes, Convex

**Spec:** `docs/superpowers/specs/2026-03-24-r2-upload-migration-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/r2.ts` | Create | R2 client: presigned URLs, download-to-file, delete |
| `app/api/upload/presign/route.ts` | Create | Presign endpoint: auth, validate, create doc, return upload URL |
| `app/api/upload/process/route.ts` | Create | Process endpoint: download from R2, run pipeline, cleanup |
| `app/api/upload/route.ts` | Delete | Old upload endpoint, replaced by presign + process |
| `convex/schema.ts` | Modify | Make `fileId` optional, add `r2Key` |
| `convex/documents.ts` | Modify | Update `create`, `remove`, `getWithFileUrl`, `listByCompany` |
| `components/upload-dropzone.tsx` | Modify | New R2 upload flow with progress, size validation |
| `.env.local` | Modify | Add R2 env vars |
| `.env.example` | Create | Document required env vars |

---

### Task 1: Install Dependencies & Add Environment Variables

**Files:**
- Modify: `package.json`
- Modify: `.env.local`
- Create: `.env.example`

- [ ] **Step 1: Install AWS SDK packages**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Add R2 env vars to `.env.local`**

```
R2_ACCOUNT_ID=<your cloudflare account id>
R2_ACCESS_KEY_ID=<your r2 api token key>
R2_SECRET_ACCESS_KEY=<your r2 api token secret>
R2_BUCKET_NAME=finansanalyse-uploads
```

These values come from the Cloudflare dashboard after creating the R2 bucket and API token (Task 8).

- [ ] **Step 3: Create `.env.example`**

```
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# OpenAI
OPENAI_API_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add @aws-sdk/client-s3 and s3-request-presigner for R2 uploads"
```

Note: Do NOT commit `.env.local`.

---

### Task 2: Create R2 Client Module

**Files:**
- Create: `lib/r2.ts`

- [ ] **Step 1: Create `lib/r2.ts`**

```typescript
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Generate a presigned PUT URL for direct browser upload.
 * Includes Content-Length condition to enforce file size server-side.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentLength: number
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: "application/pdf",
    ContentLength: contentLength,
  });
  return getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes
}

/**
 * Stream an object from R2 directly to a file on disk.
 * Avoids buffering large PDFs in Node.js memory.
 */
export async function downloadToFile(
  key: string,
  destPath: string
): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  const response = await s3.send(command);
  if (!response.Body) {
    throw new Error(`R2 object not found: ${key}`);
  }
  const body = response.Body as Readable;
  const fileStream = createWriteStream(destPath);
  await pipeline(body, fileStream);
}

/**
 * Delete an object from R2. Non-throwing — logs errors but does not fail.
 * Lifecycle rules handle cleanup if this fails.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
  } catch (error) {
    console.warn(`Failed to delete R2 object ${key}:`, error);
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit lib/r2.ts 2>&1 | head -20
```

If there are import issues with `Readable`, the S3 SDK returns a `ReadableStream` in some environments. We may need to adjust — check the actual type at runtime in Task 6.

- [ ] **Step 3: Commit**

```bash
git add lib/r2.ts
git commit -m "feat: add R2 client module with presign, download, delete helpers"
```

---

### Task 3: Update Convex Schema

**Files:**
- Modify: `convex/schema.ts:15-30`

- [ ] **Step 1: Make `fileId` optional and add `r2Key`**

In `convex/schema.ts`, change the documents table definition:

```typescript
  documents: defineTable({
    companyId: v.id("companies"),
    fileName: v.string(),
    fileId: v.optional(v.id("_storage")),
    r2Key: v.optional(v.string()),
    reportType: v.string(),
    period: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    markdownFileId: v.optional(v.id("_storage")),
    currency: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    unitEvidence: v.optional(v.string()),
    normalizationWarning: v.optional(v.string()),
    createdAt: v.number(),
    uploadedBy: v.optional(v.id("users")),
  }).index("by_company", ["companyId"]),
```

Changes from current: `fileId` goes from `v.id("_storage")` to `v.optional(v.id("_storage"))`, and `r2Key: v.optional(v.string())` is added.

- [ ] **Step 2: Verify Convex schema pushes cleanly**

```bash
npx convex dev --once
```

Expected: schema deploys without errors. Existing documents are unaffected because `fileId` going from required to optional is a non-breaking change.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: make fileId optional, add r2Key to documents schema"
```

---

### Task 4: Update Convex Document Mutations

**Files:**
- Modify: `convex/documents.ts`

- [ ] **Step 1: Update `create` mutation to accept `r2Key` instead of requiring `fileId`**

Replace the `create` mutation (lines 17-35):

```typescript
export const create = mutation({
  args: {
    companyId: v.id("companies"),
    fileName: v.string(),
    fileId: v.optional(v.id("_storage")),
    r2Key: v.optional(v.string()),
    reportType: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");
    return await ctx.db.insert("documents", {
      ...args,
      uploadedBy: userId,
      status: args.r2Key ? "uploading" : "processing",
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Update `updateStatus` to support clearing `r2Key`**

Add `r2Key` to the args in `updateStatus` (line 38-64):

```typescript
export const updateStatus = mutation({
  args: {
    id: v.id("documents"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    markdownFileId: v.optional(v.id("_storage")),
    reportType: v.optional(v.string()),
    period: v.optional(v.string()),
    currency: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    unitEvidence: v.optional(v.string()),
    normalizationWarning: v.optional(v.string()),
    clearR2Key: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Dokument ikke funnet");
    if (doc.uploadedBy && doc.uploadedBy !== userId) {
      throw new Error("Ingen tilgang til dette dokumentet");
    }
    const { id, clearR2Key, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    if (clearR2Key) {
      patch.r2Key = undefined;
    }
    await ctx.db.patch(id, patch);
  },
});
```

- [ ] **Step 3: Update `remove` to handle missing `fileId`**

In `remove` mutation (line 101-105), guard the storage delete:

```typescript
    // Delete storage files
    if (doc.fileId) {
      await ctx.storage.delete(doc.fileId);
    }
    if (doc.markdownFileId) {
      await ctx.storage.delete(doc.markdownFileId);
    }
```

- [ ] **Step 4: Update `getWithFileUrl` to handle missing `fileId`**

Replace lines 122-133:

```typescript
/** Owner-only query that includes the storage download URL. */
export const getWithFileUrl = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    if (doc.uploadedBy !== userId) return null;
    const fileUrl = doc.fileId ? await ctx.storage.getUrl(doc.fileId) : null;
    return { ...doc, fileUrl };
  },
});
```

- [ ] **Step 5: Update `listByCompany` to filter out stale uploads**

Replace lines 5-15. Filter out documents stuck in "uploading" for more than 1 hour (orphans from abandoned uploads):

```typescript
export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return docs.filter(
      (d) => d.status !== "uploading" || d.createdAt > oneHourAgo
    );
  },
});
```

- [ ] **Step 6: Verify Convex deploys**

```bash
npx convex dev --once
```

Expected: deploys without errors.

- [ ] **Step 7: Commit**

```bash
git add convex/documents.ts
git commit -m "feat: update document mutations for R2 upload flow"
```

---

### Task 5: Create Presign API Endpoint

**Files:**
- Create: `app/api/upload/presign/route.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p app/api/upload/presign
```

- [ ] **Step 2: Create `app/api/upload/presign/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { getPresignedUploadUrl } from "@/lib/r2";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const { companyId, fileName, fileSize } = (await req.json()) as {
      companyId: string;
      fileName: string;
      fileSize: number;
    };

    if (!companyId || !fileName || !fileSize) {
      return NextResponse.json(
        { error: "companyId, fileName, and fileSize are required" },
        { status: 400 }
      );
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Kun PDF-filer er støttet" },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Filen er for stor (maks 100 MB)" },
        { status: 400 }
      );
    }

    const r2Key = `uploads/${randomUUID()}.pdf`;
    const uploadUrl = await getPresignedUploadUrl(r2Key, fileSize);

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const docId = await convex.mutation(api.documents.create, {
      companyId: companyId as Id<"companies">,
      fileName,
      r2Key,
      reportType: "annet",
      period: "unknown",
    });

    return NextResponse.json({ uploadUrl, docId });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Kunne ikke generere opplastings-URL" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/upload/presign/route.ts
git commit -m "feat: add presign endpoint for R2 direct uploads"
```

---

### Task 6: Create Process API Endpoint

**Files:**
- Create: `app/api/upload/process/route.ts`
- Delete: `app/api/upload/route.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p app/api/upload/process
```

- [ ] **Step 2: Create `app/api/upload/process/route.ts`**

This is adapted from the existing `app/api/upload/route.ts`. The key changes: reads PDF from R2 instead of Convex storage, sets "processing" status, deletes from R2 after success.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convertPdfToMarkdown } from "@/lib/pdf-processor";
import { chunkMarkdown } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { extractFinancialData } from "@/lib/financial-extractor";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { downloadToFile, deleteObject } from "@/lib/r2";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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

    // 1. Fetch document and verify ownership + status
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

    const companyId = doc.companyId;
    const r2Key = doc.r2Key;

    // 2. Set status to "processing"
    await convex.mutation(api.documents.updateStatus, {
      id: typedDocId,
      status: "processing",
    });

    try {
      // 3. Download PDF from R2 to temp file
      const tempDir = await mkdtemp(join(tmpdir(), "r2-download-"));
      const pdfPath = join(tempDir, "input.pdf");

      try {
        await downloadToFile(r2Key, pdfPath);
        const pdfBuffer = await readFile(pdfPath);

        // 4. Convert PDF to Markdown
        const markdown = await convertPdfToMarkdown(pdfBuffer);

        // 5. Store markdown in Convex file storage
        const mdUploadUrl = await convex.mutation(
          api.documents.generateUploadUrl
        );
        const mdUploadResponse = await fetch(mdUploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: markdown,
        });
        const { storageId: mdStorageId } = await mdUploadResponse.json();

        // 6. Run extraction and chunking in parallel
        const [extractionResult, chunks] = await Promise.all([
          extractFinancialData(markdown),
          Promise.resolve(chunkMarkdown(markdown)),
        ]);

        // 7. Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(
          chunks.map((c) => c.content)
        );

        // 8. Store chunks with embeddings
        for (let i = 0; i < chunks.length; i++) {
          await convex.mutation(api.chunks.insert, {
            documentId: typedDocId,
            companyId,
            content: chunks[i].content,
            embedding: embeddings[i],
            chunkIndex: chunks[i].chunkIndex,
          });
        }

        // 9. Cross-period magnitude check
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

        // 10. Store financial metrics
        if (extractionResult.metrics.length > 0) {
          await convex.mutation(api.financialMetrics.insertBatch, {
            metrics: extractionResult.metrics.map((m) => ({
              documentId: typedDocId,
              companyId,
              period: extractionResult.period,
              category: m.category,
              metricName: m.metricName,
              value: m.value,
              unit: m.unit,
            })),
          });
        }

        // 11. Delete PDF from R2 (best-effort)
        await deleteObject(r2Key);

        // 12. Update document status to ready, clear r2Key
        await convex.mutation(api.documents.updateStatus, {
          id: typedDocId,
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

        return NextResponse.json({ docId, status: "ready" });
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      try {
        await convex.mutation(api.documents.updateStatus, {
          id: typedDocId,
          status: "error",
          errorMessage,
        });
      } catch {}
      return NextResponse.json({ docId, status: "error", error: errorMessage });
    }
  } catch {
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Delete old upload route**

```bash
rm app/api/upload/route.ts
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/upload/process/route.ts
git rm app/api/upload/route.ts
git commit -m "feat: add process endpoint, remove old upload route"
```

---

### Task 7: Update Upload Dropzone Component

**Files:**
- Modify: `components/upload-dropzone.tsx`

- [ ] **Step 1: Replace the full component**

```typescript
"use client";

import { useState, useCallback } from "react";
import { Id } from "@/convex/_generated/dataModel";
import {
  CloudArrowUp,
  CheckCircle,
  XCircle,
  CircleNotch,
} from "@phosphor-icons/react";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface UploadResult {
  fileName: string;
  status: "uploading" | "processing" | "ready" | "error";
  progress?: number; // 0-100 for upload phase
  error?: string;
}

function uploadToR2(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Nettverksfeil under opplasting"));
    xhr.send(file);
  });
}

export function UploadDropzone({
  companyId,
}: {
  companyId: Id<"companies">;
}) {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const updateResult = useCallback(
    (fileName: string, update: Partial<UploadResult>) => {
      setResults((prev) =>
        prev.map((r) => (r.fileName === fileName ? { ...r, ...update } : r))
      );
    },
    []
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const pdfFiles = Array.from(files).filter(
        (f) => f.type === "application/pdf"
      );
      if (pdfFiles.length === 0) return;

      setIsUploading(true);
      setResults(
        pdfFiles.map((f) => {
          if (f.size > MAX_FILE_SIZE) {
            return {
              fileName: f.name,
              status: "error" as const,
              error: "Filen er for stor (maks 100 MB)",
            };
          }
          return { fileName: f.name, status: "uploading" as const, progress: 0 };
        })
      );

      for (const file of pdfFiles) {
        if (file.size > MAX_FILE_SIZE) continue;

        try {
          // 1. Get presigned URL
          const presignRes = await fetch("/api/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              fileName: file.name,
              fileSize: file.size,
            }),
          });
          if (!presignRes.ok) {
            const err = await presignRes.json();
            throw new Error(err.error || "Kunne ikke starte opplasting");
          }
          const { uploadUrl, docId } = await presignRes.json();

          // 2. Upload directly to R2
          await uploadToR2(uploadUrl, file, (pct) => {
            updateResult(file.name, { progress: pct });
          });

          // 3. Trigger processing
          updateResult(file.name, { status: "processing" });
          const processRes = await fetch("/api/upload/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docId }),
          });
          const processData = await processRes.json();

          if (processData.status === "ready") {
            updateResult(file.name, { status: "ready" });
          } else {
            updateResult(file.name, {
              status: "error",
              error: processData.error || "Prosessering feilet",
            });
          }
        } catch (error) {
          updateResult(file.name, {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Opplasting feilet",
          });
        }
      }

      setIsUploading(false);
    },
    [companyId, updateResult]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border border-dashed rounded-card p-8 text-center transition-all duration-150 ${
          isDragging
            ? "border-accent bg-accent-subtle/20"
            : "border-white/10 hover:border-white/20"
        }`}
      >
        <CloudArrowUp
          size={32}
          weight={isDragging ? "fill" : "light"}
          className={`mx-auto mb-3 ${isDragging ? "text-accent" : "text-[#666666]"}`}
        />
        <p className="text-sm text-[#AAAAAA]">
          {isUploading ? "Prosesserer..." : "Dra og slipp PDF-filer her"}
        </p>
        <p className="text-xs text-[#666666] mt-1">eller</p>
        <label className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg cursor-pointer hover:brightness-90 transition-all duration-150 font-medium">
          Velg filer
          <input
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-card bg-elevated"
            >
              {r.status === "ready" ? (
                <CheckCircle
                  size={18}
                  weight="fill"
                  className="text-positive"
                />
              ) : r.status === "error" ? (
                <XCircle size={18} weight="fill" className="text-negative" />
              ) : (
                <CircleNotch
                  size={18}
                  className="text-warning animate-spin"
                />
              )}
              <span className="text-sm font-sans">{r.fileName}</span>
              {r.status === "uploading" && r.progress !== undefined && (
                <span className="text-xs text-[#AAAAAA] ml-auto">
                  {r.progress}%
                </span>
              )}
              {r.status === "processing" && (
                <span className="text-xs text-[#AAAAAA] ml-auto">
                  Prosesserer...
                </span>
              )}
              {r.error && (
                <span className="text-xs text-negative ml-auto">
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Key changes from current:
- Removed `useMutation(api.documents.generateUploadUrl)` and `useMutation(api.documents.create)` — no longer needed
- Added `uploadToR2` helper using `XMLHttpRequest` for progress
- Added `MAX_FILE_SIZE` client-side validation
- Added `"processing"` state with dedicated UI
- Upload progress shown as percentage

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/upload-dropzone.tsx
git commit -m "feat: rewrite upload dropzone for R2 direct upload with progress"
```

---

### Task 8: R2 Bucket Setup (Manual)

This task is done in the Cloudflare dashboard, not in code.

- [ ] **Step 1: Create Cloudflare account** (if needed)

Go to https://dash.cloudflare.com/ and sign up.

- [ ] **Step 2: Create R2 bucket**

Navigate to R2 → Create bucket → Name: `finansanalyse-uploads` → Create.

- [ ] **Step 3: Create R2 API token**

Navigate to R2 → Manage R2 API Tokens → Create API token.
- Token name: `finansanalyse-server`
- Permissions: Object Read & Write
- Specify bucket: `finansanalyse-uploads`
- Copy the Access Key ID and Secret Access Key.

- [ ] **Step 4: Configure CORS**

In the bucket settings → CORS policy, add:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `your-production-domain.com` with your actual domain.

- [ ] **Step 5: Configure lifecycle rule**

In bucket settings → Object lifecycle rules → Add rule:
- Rule name: `cleanup-uploads`
- Prefix filter: `uploads/`
- Action: Delete after 1 day

- [ ] **Step 6: Update `.env.local` with real values**

```
R2_ACCOUNT_ID=<from Cloudflare dashboard, top right of R2 page>
R2_ACCESS_KEY_ID=<from step 3>
R2_SECRET_ACCESS_KEY=<from step 3>
R2_BUCKET_NAME=finansanalyse-uploads
```

- [ ] **Step 7: Add R2 env vars to Railway**

In Railway dashboard → your service → Variables, add the same four env vars.

---

### Task 9: End-to-End Testing

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test small PDF upload (~1MB)**

Upload a small PDF. Verify:
- Presign call succeeds (check Network tab)
- R2 upload completes (PUT request to R2 URL, 200)
- Process call succeeds
- Document shows "ready" status
- Financial metrics extracted correctly

- [ ] **Step 3: Test large PDF upload (~30MB+)**

Upload a large annual report. Verify:
- Progress bar shows percentage during upload
- Status transitions: uploading → processing → ready
- No 524 timeout errors
- Document processes correctly

- [ ] **Step 4: Test file size rejection**

Try uploading a file >100MB. Verify:
- Client shows "Filen er for stor (maks 100 MB)" immediately
- No network requests made

- [ ] **Step 5: Test non-PDF rejection**

Try uploading a .docx or .txt file. Verify it's filtered out (only PDFs accepted).

- [ ] **Step 6: Verify existing documents still work**

Check that documents uploaded before this change still appear correctly in the documents tab and chat works against their data.

- [ ] **Step 7: Verify R2 cleanup**

After a successful upload, check the R2 bucket in Cloudflare dashboard. The uploaded PDF should be deleted (or will be cleaned up by lifecycle rule within 24h).
