import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

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
    return await ctx.db.insert("chunks", args);
  },
});

export const search = action({
  args: {
    companyId: v.id("companies"),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
    return await ctx.db.get(args.id);
  },
});
