import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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
    const visible = docs.filter(
      (d) => d.status !== "uploading" || d.createdAt > oneHourAgo
    );
    return Promise.all(
      visible.map(async (d) => ({
        ...d,
        markdownUrl: d.markdownFileId
          ? await ctx.storage.getUrl(d.markdownFileId)
          : null,
      }))
    );
  },
});

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
    periodScope: v.optional(v.string()),
    periodEvidence: v.optional(v.string()),
    normalizationWarning: v.optional(v.string()),
    fileName: v.optional(v.string()),
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

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Dokument ikke funnet");

    // Admin emails can delete any document
    const identity = await ctx.auth.getUserIdentity();
    const adminEmails = ["s2419213@bi.no"];
    const isAdmin = identity?.email && adminEmails.includes(identity.email);

    // Ownership check — only block if owned by a different user (unless admin)
    if (!isAdmin && doc.uploadedBy && doc.uploadedBy !== userId) {
      throw new Error("Du kan kun slette dokumenter du selv har lastet opp");
    }

    // Delete chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete metrics
    const metrics = await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", doc.companyId))
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .collect();
    for (const metric of metrics) {
      await ctx.db.delete(metric._id);
    }

    // Delete storage files
    if (doc.fileId) {
      await ctx.storage.delete(doc.fileId);
    }
    if (doc.markdownFileId) {
      await ctx.storage.delete(doc.markdownFileId);
    }

    // Delete document record
    await ctx.db.delete(args.id);
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    if (doc.uploadedBy && doc.uploadedBy !== userId) return null;
    return doc;
  },
});

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

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");
    return await ctx.storage.generateUploadUrl();
  },
});
