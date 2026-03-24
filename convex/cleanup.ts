import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
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
