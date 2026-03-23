import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

export const insert = mutation({
  args: {
    documentId: v.id("documents"),
    companyId: v.id("companies"),
    content: v.string(),
    embedding: v.array(v.float64()),
    chunkIndex: v.number(),
    pageRange: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Verify the user owns the document they're adding chunks to
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.uploadedBy !== userId) {
      throw new Error("Ingen tilgang til dette dokumentet");
    }
    // Ensure companyId matches the document's company
    if (doc.companyId !== args.companyId) {
      throw new Error("companyId samsvarer ikke med dokumentet");
    }

    return await ctx.db.insert("chunks", args);
  },
});

export const search = action({
  args: {
    companyId: v.id("companies"),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Array<{ content: string; companyId: Id<"companies">; documentId: Id<"documents">; chunkIndex: number; pageRange?: string; score: number; _id: Id<"chunks">; _creationTime: number }>> => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Ikke autentisert");

    const { api } = await import("./_generated/api");
    const results = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 8,
      filter: (q) => q.eq("companyId", args.companyId),
    });
    const chunks = await Promise.all(
      results.map(async (result) => {
        const chunk = await ctx.runQuery(api.chunks.getById, { id: result._id });
        return { ...chunk, score: result._score };
      })
    );
    return chunks;
  },
});

export const getById = query({
  args: { id: v.id("chunks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(args.id);
  },
});
