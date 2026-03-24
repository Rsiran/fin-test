# Stale Document Cleanup

## Goal

Automatically delete failed, stuck, and abandoned documents older than 24 hours to prevent database clutter and R2 storage leaks.

## Background

When document processing fails (PDF conversion errors, embedding failures, etc.), the document record remains in the database with status `"error"`. Similarly, uploads that are abandoned mid-flight stay as `"uploading"`, and processing that crashes stays as `"processing"`. These records accumulate over time. The `listByCompany` query hides `"uploading"` docs older than 1 hour from the UI, but never deletes them.

Additionally, abandoned `"uploading"` documents still have `r2Key` set — the PDF sits in Cloudflare R2 indefinitely. While R2 has a 24h lifecycle rule on the `uploads/` prefix, explicit cleanup is more reliable.

## Design

### Cleanup Target

Documents matching ALL of:
- `status` is one of: `"error"`, `"uploading"`, `"processing"`
- `createdAt` is older than 24 hours

### Architecture: Action + Mutation Split

Convex mutations cannot make HTTP calls, and actions cannot access `ctx.db` directly. The cleanup is therefore split into three internal functions:

1. **`internalQuery: getStaleDocuments`** — queries the database, filters for stale documents, returns pre-filtered results (IDs + r2Keys only). The action calls this to get the work list.
2. **`internalAction: cleanupStaleDocuments`** — the cron entry point. Calls the query to get stale documents, deletes R2 objects (network call), then calls the mutation for each document's database cleanup.
3. **`internalMutation: deleteStaleDocument`** — deletes a single document and its associated database records (chunks, metrics, storage files). Each document deletion is its own transaction — if one fails, the others are not affected.

None of these functions are callable from clients — only the cron scheduler invokes the action.

### Mechanism

The cron runs **every hour** and invokes the internal action, which:

1. Calls `getStaleDocuments` internal query, which:
   - Queries all documents (full table scan — acceptable at current scale, see note below)
   - Filters for documents matching the cleanup criteria
   - Returns only matching documents' `_id`, `r2Key`, and `companyId` (pre-filtered, minimal payload)
2. Caps at **50 documents per run** to stay within Convex execution limits. Remaining stale docs are caught in the next hourly run.
3. For each matching document, wrapped in try/catch so one failure does not block the rest:
   - Delete R2 object (`r2Key`) if present, using best-effort delete (non-throwing)
   - Call `deleteStaleDocument` internal mutation, which performs cascade deletion:
     - Delete all chunks with matching `documentId` (via `by_document` index)
     - Delete all financial metrics with matching `documentId` (via `by_company` index + `.filter()` on `documentId` — no `by_document` index exists on `financialMetrics`, matching the existing `remove` pattern)
     - Delete storage file (`fileId`) if present, guarded with try/catch
     - Delete markdown storage file (`markdownFileId`) if present, guarded with try/catch
     - Delete the document record itself
4. Log how many documents were found, deleted, and failed

### File Changes

| File | Change |
|------|--------|
| `convex/crons.ts` | **Create** — defines hourly cron schedule pointing to `cleanupStaleDocuments` action |
| `convex/cleanup.ts` | **Create** — `getStaleDocuments` internal query + `cleanupStaleDocuments` internal action + `deleteStaleDocument` internal mutation |

### Configuration Changes

R2 credentials must be added to the **Convex environment** (not just `.env.local`). The following env vars need to be set via `npx convex env set` or the Convex dashboard:
- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

### No Other Changes Required

- No schema changes
- No frontend changes
- No API route changes
- No new dependencies (R2 client already exists in `lib/r2.ts` — but note this is a Next.js module; the Convex action will need its own R2 client or the delete logic inlined, since Convex actions run in the Convex runtime, not Next.js. See implementation note below.)

### Implementation Note: R2 Access from Convex Actions

`lib/r2.ts` runs in the Next.js server runtime. Convex actions run in Convex's own runtime. The cleanup action cannot import `lib/r2.ts` directly. Options:

- **Option A (recommended):** Inline a minimal S3 `DeleteObject` call in the Convex action using `fetch` against the R2 endpoint, or use `@aws-sdk/client-s3` as a Convex dependency.
- **Option B:** Call a Next.js API route from the Convex action to trigger R2 deletion. Adds unnecessary complexity.
- **Option C:** Rely solely on R2's 24h lifecycle rule for orphan cleanup and skip R2 deletion in the cron. Simpler but less explicit.

## Edge Cases

- **Document currently being processed:** A document that has been processing for 25 hours is almost certainly stuck. 24h is a generous threshold — normal processing takes minutes.
- **No stale documents:** The cron runs, finds nothing, does nothing. No-op is fine.
- **Storage file already deleted:** `ctx.storage.delete` on a missing file may throw — guard with try/catch. This is an improvement over the existing `remove` mutation which does not guard these calls.
- **Large batch:** Capped at 50 documents per cron run. Remaining stale docs are picked up in subsequent runs. Protects against mutation timeouts from unexpected spikes (e.g., bulk import failure).
- **R2 deletion fails:** Non-throwing — the document record is still deleted from Convex. The R2 lifecycle rule serves as a safety net for any leaked objects.
- **Scale:** The full table scan is acceptable at current scale (tens to low hundreds of documents). If the document count grows significantly, adding a `by_status` compound index (`["status", "createdAt"]`) would allow targeted queries. Not needed now.
