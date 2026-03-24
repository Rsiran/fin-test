# R2 Upload Migration — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Problem:** PDF uploads fail for files >~10MB because Convex storage uploads go through Cloudflare's proxy, which returns a 524 timeout. Annual reports (30-100MB) are a core use case.
**Solution:** Upload PDFs directly to Cloudflare R2 via presigned URLs. Process from R2, then delete. Keep Convex storage for small files (markdown).

---

## Upload Flow

```
1. User drops PDF
   → Client validates: type=pdf, size ≤ 100MB

2. Client calls POST /api/upload/presign
   → API authenticates user (Convex session token)
   → Generates R2 key: uploads/{uuid}.pdf
   → Creates document record in Convex (status: "uploading", r2Key set)
   → Returns { uploadUrl, docId }

3. Client PUTs file directly to R2 via presigned URL
   → Uses XMLHttpRequest for upload progress tracking
   → No server intermediary — browser talks directly to R2

4. Client calls POST /api/upload/process
   → API authenticates, verifies ownership + status === "uploading"
   → Downloads PDF from R2 using r2Key
   → Processes: PDF → markdown → chunks → embeddings → metrics
   → Stores markdown in Convex storage (small file, unchanged)
   → Deletes PDF from R2
   → Clears r2Key, updates document status to "ready"
```

---

## API Endpoints

### `POST /api/upload/presign`

- **Auth:** Convex session token (via `convexAuthNextjsToken()`)
- **Body:** `{ companyId: string, fileName: string }`
- **Validation:** fileName ends with `.pdf`
- **Actions:**
  1. Generate unique R2 key: `uploads/{uuid}.pdf`
  2. Create presigned PUT URL (15 min expiry, content-type: application/pdf)
  3. Create Convex document record: `{ companyId, fileName, r2Key, status: "uploading", uploadedBy: userId }`
- **Returns:** `{ uploadUrl: string, docId: string }`
- **Errors:** 401 if unauthenticated, 400 if invalid input

### `POST /api/upload/process`

- **Auth:** Convex session token
- **Body:** `{ docId: string }`
- **Validation:** Document exists, owned by caller, status === "uploading"
- **Actions:**
  1. Download PDF from R2 using document's `r2Key`
  2. Convert PDF to markdown (`lib/pdf-processor.ts`)
  3. Upload markdown to Convex storage (unchanged)
  4. Chunk markdown + generate embeddings (unchanged)
  5. Extract financial data via GPT-4o (unchanged)
  6. Cross-period magnitude check (unchanged)
  7. Store chunks + metrics in Convex (unchanged)
  8. Delete PDF from R2
  9. Clear `r2Key` on document, set status to `"ready"`
- **Returns:** `{ docId: string, status: "ready" | "error", error?: string }`
- **Errors:** 401, 404, processing errors set status to "error"

### Removed

- `POST /api/upload` — replaced by presign + process

---

## Infrastructure

### R2 Bucket

- **Name:** `finansanalyse-uploads`
- **CORS:** Allow PUT from production domain + `localhost:3000`
- **Lifecycle rule:** Auto-delete objects with prefix `uploads/` after 24 hours (catches orphans from failed uploads)

### New Dependencies

- `@aws-sdk/client-s3` — fetch/delete objects
- `@aws-sdk/s3-request-presigner` — generate presigned PUT URLs

### Environment Variables

```
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 api token key>
R2_SECRET_ACCESS_KEY=<r2 api token secret>
R2_BUCKET_NAME=finansanalyse-uploads
```

### R2 Client Module — `lib/r2.ts`

Exports:
- `getPresignedUploadUrl(key: string): Promise<string>` — presigned PUT URL, 15 min expiry
- `downloadObject(key: string): Promise<Buffer>` — download object as Buffer
- `deleteObject(key: string): Promise<void>` — delete object

Uses `S3Client` configured with R2 endpoint: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

---

## Frontend Changes

### `upload-dropzone.tsx`

**Validation:**
- Reject files > 100MB: "Filen er for stor (maks 100 MB)"

**Upload flow replacement:**
1. Call `POST /api/upload/presign` → `{ uploadUrl, docId }`
2. PUT file to R2 via `XMLHttpRequest` (for progress tracking)
3. Call `POST /api/upload/process` → `{ docId, status }`

**Progress states:**
- `uploading` — file being sent to R2 (progress bar with %)
- `processing` — server processing (spinner, "Prosesserer...")
- `ready` — done
- `error` — failed at any stage

**Removed:**
- `useMutation(api.documents.generateUploadUrl)` — no longer called from client for PDF uploads
- Direct Convex storage fetch in upload flow

---

## Schema Changes

### `convex/schema.ts` — documents table

```diff
  documents: defineTable({
    companyId: v.id("companies"),
    fileName: v.string(),
-   fileId: v.id("_storage"),
+   fileId: v.optional(v.id("_storage")),
+   r2Key: v.optional(v.string()),
    reportType: v.string(),
    period: v.string(),
    status: v.string(),
    ...
  })
```

### `convex/documents.ts` — mutation changes

- **`create`:** Accept optional `fileId` OR `r2Key` (new documents use `r2Key`)
- **`updateStatus`:** Add optional `r2Key` field (to clear it after processing)
- **`remove`:** Skip `ctx.storage.delete(doc.fileId)` when `fileId` is absent
- **`getWithFileUrl`:** Handle missing `fileId` gracefully (return null for fileUrl)
- **`generateUploadUrl`:** Keep — still used for markdown storage in processing pipeline

### No Data Migration

Existing documents have `fileId` set and `status: "ready"`. They continue working unchanged. New documents go through R2. Forward-only change.

---

## Error Handling

| Failure Point | Behavior |
|---|---|
| Presign fails (auth, validation) | Client shows error, no document created |
| R2 upload fails (network, timeout) | Client shows "Opplasting feilet", document stays `status: "uploading"`, R2 lifecycle rule cleans up in 24h |
| Processing fails (PDF corrupt, GPT error) | Document set to `status: "error"` with message, R2 lifecycle rule cleans up |
| R2 delete fails after processing | Non-blocking — lifecycle rule catches it within 24h |

---

## What Stays the Same

- Markdown storage in Convex (small files, no timeout issues)
- Chunk storage, embeddings, vector index — unchanged
- Financial metrics extraction and storage — unchanged
- Chat API — completely unchanged
- `documents-tab.tsx` — unchanged (reads same Convex data)
- Document deletion UX — unchanged (no R2 cleanup needed, PDF already deleted)
- Markdown download — served from Convex storage as before
