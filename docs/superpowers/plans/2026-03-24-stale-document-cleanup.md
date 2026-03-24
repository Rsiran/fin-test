# Stale Document Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically delete failed/stuck/abandoned documents older than 24 hours via a Convex cron job.

**Architecture:** Three internal Convex functions split across two files — an `internalQuery` and `internalMutation` in `convex/cleanup.ts` (default Convex runtime, needs `ctx.db`), and an `internalAction` in `convex/cleanupActions.ts` (`"use node"` runtime, needs AWS SDK for R2). Cron runs hourly.

**Tech Stack:** Convex (crons, internal functions), `@aws-sdk/client-s3` (R2 delete from Convex Node.js action runtime)

**Spec:** `docs/superpowers/specs/2026-03-24-stale-document-cleanup-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `convex/cleanup.ts` | **Create** — `getStaleDocuments` (internalQuery) + `deleteStaleDocument` (internalMutation). No `"use node"` — these need `ctx.db`. |
| `convex/cleanupActions.ts` | **Create** — `cleanupStaleDocuments` (internalAction) with `"use node"`. Orchestrates R2 deletion + calls mutation for DB cleanup. |
| `convex/crons.ts` | **Create** — Hourly cron schedule pointing to `cleanupActions.cleanupStaleDocuments` |

No other files are created or modified.

**Important:** `"use node"` makes all functions in a file run in the Node.js runtime, where `ctx.db` is NOT available. That's why the query/mutation (which need `ctx.db`) and the action (which needs AWS SDK) must be in separate files.

---

### Task 1: Create the internal query and mutation

**Files:**
- Create: `convex/cleanup.ts`

**Reference:** The cascade delete logic in `convex/documents.ts:76-121` (the `remove` mutation). The mutation replicates that logic without auth checks, and adds try/catch around storage deletes.

- [ ] **Step 1: Create `convex/cleanup.ts` with query and mutation**

```typescript
import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_DOCS_PER_RUN = 50;
const STALE_STATUSES = ["error", "uploading", "processing"];

export const getStaleDocuments = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Full table scan — acceptable at low volume; add by_status index if scale increases
    const cutoff = Date.now() - STALE_THRESHOLD_MS;
    const allDocs = await ctx.db.query("documents").collect();
    return allDocs
      .filter((d) => STALE_STATUSES.includes(d.status) && d.createdAt < cutoff)
      .slice(0, MAX_DOCS_PER_RUN)
      .map((d) => ({ _id: d._id, r2Key: d.r2Key, companyId: d.companyId }));
  },
});

export const deleteStaleDocument = internalMutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return; // Already deleted

    // Delete chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete metrics (no by_document index — use by_company + filter)
    const metrics = await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", doc.companyId))
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .collect();
    for (const metric of metrics) {
      await ctx.db.delete(metric._id);
    }

    // Delete storage files (guarded — may already be deleted)
    if (doc.fileId) {
      try {
        await ctx.storage.delete(doc.fileId);
      } catch {
        // Storage file already deleted or missing
      }
    }
    if (doc.markdownFileId) {
      try {
        await ctx.storage.delete(doc.markdownFileId);
      } catch {
        // Storage file already deleted or missing
      }
    }

    // Delete the document record
    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 2: Verify the Convex dev server accepts the file**

Run: `npx convex dev` (should already be running — check terminal output for errors)
Expected: No type errors or build failures related to `cleanup.ts`. The `_generated/api.ts` will regenerate to include the `cleanup` module.

- [ ] **Step 3: Commit**

```bash
git add convex/cleanup.ts
git commit -m "feat: add getStaleDocuments query and deleteStaleDocument mutation"
```

---

### Task 2: Create the internal action

**Files:**
- Create: `convex/cleanupActions.ts`

**Note:** This file uses `"use node"` because the action needs `@aws-sdk/client-s3` for R2 deletion. The query and mutation are in the separate `convex/cleanup.ts` (no `"use node"`) so they retain `ctx.db` access.

- [ ] **Step 1: Create `convex/cleanupActions.ts`**

```typescript
"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function deleteR2Object(client: S3Client, key: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.warn(`Cleanup: failed to delete R2 object ${key}:`, error);
  }
}

export const cleanupStaleDocuments = internalAction({
  args: {},
  handler: async (ctx) => {
    const staleDocs = await ctx.runQuery(internal.cleanup.getStaleDocuments);

    if (staleDocs.length === 0) {
      console.log("Cleanup: no stale documents found");
      return;
    }

    const r2Client = getR2Client();
    let deleted = 0;
    let failed = 0;

    for (const doc of staleDocs) {
      try {
        // Delete R2 object if present
        if (doc.r2Key && r2Client) {
          await deleteR2Object(r2Client, doc.r2Key);
        }

        // Cascade delete from database
        await ctx.runMutation(internal.cleanup.deleteStaleDocument, {
          id: doc._id,
        });

        deleted++;
      } catch (error) {
        failed++;
        console.error(`Cleanup: failed to delete document ${doc._id}:`, error);
      }
    }

    console.log(
      `Cleanup: found ${staleDocs.length}, deleted ${deleted}, failed ${failed}`
    );
  },
});
```

- [ ] **Step 2: Verify Convex dev server accepts the changes**

Check terminal output for type/build errors.
Expected: No errors. The `internal.cleanup.getStaleDocuments` and `internal.cleanup.deleteStaleDocument` references should resolve (codegen runs automatically in watch mode).

- [ ] **Step 3: Commit**

```bash
git add convex/cleanupActions.ts
git commit -m "feat: add cleanupStaleDocuments action with R2 cleanup"
```

---

### Task 3: Create the cron schedule

**Files:**
- Create: `convex/crons.ts`

- [ ] **Step 1: Create `convex/crons.ts`**

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup stale documents",
  { hours: 1 },
  internal.cleanupActions.cleanupStaleDocuments
);

export default crons;
```

- [ ] **Step 2: Verify Convex dev server accepts the cron**

Check terminal output. Convex should register the cron job.
Expected: No errors. Dashboard should show the cron under "Cron Jobs" if you check.

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat: add hourly cron job for stale document cleanup"
```

---

### Task 4: Set R2 environment variables in Convex

**Files:** None (configuration only)

**Context:** The R2 credentials are currently only in `.env.local` (Next.js). The Convex action runs in Convex's own runtime and needs these vars set separately.

- [ ] **Step 1: Set environment variables via Convex CLI**

Run each command, using the values from `.env.local`:

```bash
npx convex env set R2_ACCOUNT_ID "<value from .env.local>"
npx convex env set R2_BUCKET_NAME "<value from .env.local>"
npx convex env set R2_ACCESS_KEY_ID "<value from .env.local>"
npx convex env set R2_SECRET_ACCESS_KEY "<value from .env.local>"
```

- [ ] **Step 2: Verify env vars are set**

Run: `npx convex env list`
Expected: All four R2 variables appear in the output.

---

### Task 5: End-to-end verification

- [ ] **Step 1: Verify the cron is registered**

Open the Convex dashboard -> Cron Jobs. Confirm "cleanup stale documents" appears with an hourly interval.

- [ ] **Step 2: Test with a stale document (optional)**

If there are already documents with status `"error"`, `"uploading"`, or `"processing"` older than 24h in the database, you can trigger the action manually from the Convex dashboard (Functions -> `cleanupActions:cleanupStaleDocuments` -> Run) and check the logs for the cleanup summary.

- [ ] **Step 3: Commit any remaining changes and push**

```bash
git push
```
