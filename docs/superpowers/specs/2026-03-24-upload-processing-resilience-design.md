# Upload Processing Resilience

**Date:** 2026-03-24
**Status:** Approved

## Problem

Three related failures in the document upload/processing pipeline:

1. **Java OOM** — `@opendataloader/pdf` uses Java internally. The Dockerfile sets `ENV _JAVA_OPTIONS="-Xmx512m"` (line 30), capping the JVM at 512MB. This is insufficient for large financial reports (up to 300 pages). The Java process gets OOM-killed (`exit code null`).
2. **Stuck "processing" documents** — The process API route runs the full pipeline synchronously. If the Java process dies or the route times out, the catch block never executes, leaving documents permanently in `"processing"` status.
3. **Slow stale cleanup** — The hourly cron only cleans up stale documents after 24 hours, meaning stuck documents linger in the UI for a full day.

## Approach

Combined approach: fix the OOM issue at its source (Dockerfile), decouple processing from the HTTP request lifecycle (fire-and-forget), update the client to handle the new async flow, add an explicit timeout, and tighten the stale cleanup window. No new infrastructure required.

## Design

### 1. Java Heap — Fix at Source

**File:** `Dockerfile` (line 30)

Change `ENV _JAVA_OPTIONS="-Xmx512m"` to `ENV _JAVA_OPTIONS="-Xmx4g"`. This is where the 512MB cap originates — the Dockerfile sets it explicitly for the production container. In development (running `next dev` locally), the Dockerfile isn't used and Java defaults to ~1/4 of system RAM, which is already sufficient.

**Verification:** After deploying, confirm the JVM picks up the new value by checking logs for `Picked up _JAVA_OPTIONS: -Xmx4g` (the JVM prints this to stderr automatically).

**Constraint:** The Railway instance needs at least 6GB total RAM (4GB Java + ~500MB Node.js). Embeddings are generated via OpenAI API (`text-embedding-3-small`), not locally, so they don't add memory pressure.

### 2. Fire-and-Forget Process Route

**File:** `app/api/upload/process/route.ts`

Refactor the route into two phases:

**Phase 1 (synchronous — in the route):**
- Validate auth and document state
- Verify `status === "uploading"` and `r2Key` exists
- Set status to `"processing"`
- Return `{ docId, status: "processing" }` immediately

**Phase 2 (asynchronous — detached background function):**
- Download PDF from R2 to temp directory
- Convert to markdown via opendataloader
- Chunk markdown and generate embeddings (OpenAI API)
- Extract financial metrics with magnitude check
- Store all results in Convex
- Clean up temp files (in `finally` block)
- Set status to `"ready"` or `"error"`

The background function (`processInBackground`) is kicked off without `await` and has its own try/catch that sets `"error"` status on failure. The Convex HTTP client and auth token are captured before the route returns (tokens last ~1 hour, well within the 10-minute processing timeout).

**Failure mode:** If the Node.js process itself crashes (e.g., Railway redeploy mid-processing), the background function dies silently. The 2-hour stale cleanup (Section 4) acts as the backstop for this case.

### 3. Client Update for Async Flow

**File:** `components/upload-context.tsx`

The client currently awaits the process route response and checks `processData.status === "ready"` to determine success. With fire-and-forget, the route returns `{ status: "processing" }` immediately, which the current code would interpret as failure.

**Fix:** Update `handleFiles` to treat `"processing"` as a successful handoff. The upload result status stays at `"processing"` and the Convex reactive query in `DocumentsTab` handles the transition to `"ready"` or `"error"` automatically.

```
// Before:
if (processData.status === "ready") {
  updateResult(id, { status: "ready" });
} else {
  updateResult(id, { status: "error", ... });
}

// After:
if (processData.status === "ready" || processData.status === "processing") {
  updateResult(id, { status: processData.status });
} else {
  updateResult(id, { status: "error", ... });
}
```

No other frontend changes needed — the upload context already shows "Prosesserer..." for processing status, and `DocumentsTab` reactively updates from Convex.

### 4. Processing Timeout

**File:** `app/api/upload/process/route.ts` (inside `processInBackground`)

Wrap the heavy processing in `Promise.race` with a 10-minute timeout. On timeout:
- Clean up temp directory
- Set document status to `"error"` with message `"Prosessering tidsavbrutt (>10 min)"`

The Java process may continue running briefly after timeout. Since `@opendataloader/pdf` does not expose a handle to the child process, we cannot kill it directly — this is a known limitation. The process will exit on its own when it finishes or hits OOM. The important thing is the document gets a terminal status immediately.

**Why 10 minutes:** A 300-page report through opendataloader + OpenAI embedding generation takes 3-5 minutes typically. 10 minutes gives 2x headroom while catching stuck processes far faster than the stale cleanup.

**Note:** The 10-minute timeout must stay well below the ~1 hour auth token TTL. If the timeout is ever increased, validate against token expiry.

### 5. Stale Cleanup Threshold

**File:** `convex/cleanup.ts`

Reduce `STALE_THRESHOLD_MS` from 24 hours to 2 hours. With the 10-minute timeout in place, the only way a document stays in `"processing"` beyond 10 minutes is a container crash. Two hours is more than sufficient to catch these edge cases.

This applies to all stale statuses:
- `"processing"` for 2h = container crash, definitely stale
- `"uploading"` for 2h = abandoned upload, definitely stale
- `"error"` for 2h = already failed, user has had time to see it

The hourly cron schedule remains unchanged.

### 6. Data Cleanup (One-Time)

Delete three currently stuck documents via temporary admin mutation:

| Created | File | Status | Issue |
|---------|------|--------|-------|
| 18:12 | AR22.pdf | `error` | OOM kill |
| 18:21 | AR22.pdf | `processing` | Route timeout |
| 18:23 | AR24.pdf | `processing` | Route timeout |

Also delete any orphaned chunks/metrics associated with these documents.

## Files Changed

| File | Change |
|------|--------|
| `Dockerfile` | Change `-Xmx512m` to `-Xmx4g` |
| `app/api/upload/process/route.ts` | Extract `processInBackground`, add timeout wrapper, return early |
| `components/upload-context.tsx` | Treat `"processing"` response as successful handoff |
| `convex/cleanup.ts` | Reduce threshold from 24h to 2h |

## Not In Scope

- **Parallel file uploads** — Files still process sequentially. Parallelization is a separate improvement.
- **Automatic retry** — Failed documents require manual re-upload. Retry logic adds complexity without clear need at current scale.
- **Background worker infrastructure** — No Redis/BullMQ. The fire-and-forget pattern is sufficient.
- **Processing progress sub-states** — With fire-and-forget, the client cannot show granular progress (e.g., "converting...", "generating embeddings..."). This would require adding status sub-states to the document model.
- **XHR abort on navigation** — If the user navigates away from the app entirely, in-flight XHR uploads may be abandoned. The stale cleanup handles this.
