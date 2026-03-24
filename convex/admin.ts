import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Admin functions — protected by adminSecret validated against ADMIN_API_SECRET env var.
// Set via: npx convex env set ADMIN_API_SECRET <secret>

function checkAdminSecret(secret: string) {
  if (!process.env.ADMIN_API_SECRET || secret !== process.env.ADMIN_API_SECRET) {
    throw new Error("Unauthorized");
  }
}

// --- Queries ---

export const getDocumentWithMarkdown = query({
  args: { docId: v.id("documents"), adminSecret: v.string() },
  handler: async (ctx, args) => {
    checkAdminSecret(args.adminSecret);
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.markdownFileId) return null;
    const url = await ctx.storage.getUrl(doc.markdownFileId);
    return {
      _id: doc._id,
      companyId: doc.companyId,
      period: doc.period,
      fileName: doc.fileName,
      markdownUrl: url,
    };
  },
});

export const getReadyDocumentsByCompany = query({
  args: { companyId: v.id("companies"), adminSecret: v.string() },
  handler: async (ctx, args) => {
    checkAdminSecret(args.adminSecret);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    return docs
      .filter((d) => d.status === "ready" && d.markdownFileId)
      .map((d) => d._id);
  },
});

// --- Mutations ---

/** Atomically replace metrics for a document: delete old, insert new. */
export const replaceMetrics = mutation({
  args: {
    adminSecret: v.string(),
    documentId: v.id("documents"),
    metrics: v.array(v.object({
      documentId: v.id("documents"),
      companyId: v.id("companies"),
      period: v.string(),
      category: v.string(),
      metricName: v.string(),
      value: v.number(),
      unit: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    checkAdminSecret(args.adminSecret);

    // Delete old metrics
    const old = await ctx.db
      .query("financialMetrics")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const m of old) {
      await ctx.db.delete(m._id);
    }

    // Insert new metrics
    for (const metric of args.metrics) {
      await ctx.db.insert("financialMetrics", {
        ...metric,
        createdAt: Date.now(),
      });
    }

    return { deleted: old.length, inserted: args.metrics.length };
  },
});

export const updateDocumentExtraction = mutation({
  args: {
    adminSecret: v.string(),
    docId: v.id("documents"),
    period: v.string(),
    reportType: v.string(),
    currency: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    unitEvidence: v.optional(v.string()),
    normalizationWarning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    checkAdminSecret(args.adminSecret);
    const { adminSecret: _, docId, ...fields } = args;
    await ctx.db.patch(docId, fields);
  },
});
