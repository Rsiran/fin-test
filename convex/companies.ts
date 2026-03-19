import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("companies").collect();
  },
});

export const get = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    ticker: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("companies", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const removeWithData = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    // Delete chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_company", (q) => q.eq("companyId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete financial metrics
    const metrics = await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", args.id))
      .collect();
    for (const metric of metrics) {
      await ctx.db.delete(metric._id);
    }

    // Delete documents and their storage files
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_company", (q) => q.eq("companyId", args.id))
      .collect();
    for (const doc of documents) {
      await ctx.storage.delete(doc.fileId);
      if (doc.markdownFileId) {
        await ctx.storage.delete(doc.markdownFileId);
      }
      await ctx.db.delete(doc._id);
    }

    // Delete chat messages then sessions
    const sessions = await ctx.db
      .query("chatSessions")
      .withIndex("by_company", (q) => q.eq("companyId", args.id))
      .collect();
    for (const session of sessions) {
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const msg of messages) {
        await ctx.db.delete(msg._id);
      }
      await ctx.db.delete(session._id);
    }

    // Delete the company itself
    await ctx.db.delete(args.id);
  },
});
