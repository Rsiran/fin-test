import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Admin functions — no user auth required.
// Protected by ADMIN_API_SECRET check in the Next.js API route.

export const getDocumentWithMarkdown = query({
  args: { docId: v.id("documents") },
  handler: async (ctx, args) => {
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
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    return docs
      .filter((d) => d.status === "ready" && d.markdownFileId)
      .map((d) => d._id);
  },
});

export const deleteMetricsByDocument = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query("financialMetrics")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const m of metrics) {
      await ctx.db.delete(m._id);
    }
    return metrics.length;
  },
});

export const insertMetricsAdmin = mutation({
  args: {
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
    for (const metric of args.metrics) {
      await ctx.db.insert("financialMetrics", {
        ...metric,
        createdAt: Date.now(),
      });
    }
    return args.metrics.length;
  },
});

export const getMetricsByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const updateDocumentExtraction = mutation({
  args: {
    docId: v.id("documents"),
    period: v.string(),
    reportType: v.string(),
    currency: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    unitEvidence: v.optional(v.string()),
    normalizationWarning: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { docId, ...fields } = args;
    await ctx.db.patch(docId, fields);
  },
});
