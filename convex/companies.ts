import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db.query("companies").collect();
  },
});

export const get = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(args.id);
  },
});

export const search = query({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let companies = await ctx.db.query("companies").collect();

    if (args.query) {
      const q = args.query.toLowerCase();
      companies = companies.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.ticker && c.ticker.toLowerCase().includes(q))
      );
    }

    // Limit to 100 companies to avoid unbounded N+1 queries
    const limited = companies.slice(0, 100);

    // Fetch all documents once and group by company in-memory
    const allDocs = await ctx.db.query("documents").collect();
    const docsByCompany = new Map<string, { count: number; lastDate: number }>();
    for (const doc of allDocs) {
      const key = doc.companyId;
      const existing = docsByCompany.get(key);
      if (!existing) {
        docsByCompany.set(key, { count: 1, lastDate: doc.createdAt });
      } else {
        existing.count++;
        if (doc.createdAt > existing.lastDate) existing.lastDate = doc.createdAt;
      }
    }

    return limited.map((company) => {
      const stats = docsByCompany.get(company._id) ?? { count: 0, lastDate: null as number | null };
      return {
        ...company,
        reportCount: stats.count,
        lastReportDate: stats.lastDate,
      };
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    ticker: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    const companyId = await ctx.db.insert("companies", {
      ...args,
      createdAt: Date.now(),
    });
    // Auto-add to watchlist for the creating user
    await ctx.db.insert("watchlist", {
      userId,
      companyId,
    });
    return companyId;
  },
});

export const removeWithData = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Only allow deletion if user has this company on their watchlist
    const watchlistEntry = await ctx.db
      .query("watchlist")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.id)
      )
      .unique();
    if (!watchlistEntry) {
      throw new Error("Du har ikke tilgang til å slette dette selskapet");
    }

    // Prevent deletion if other users have documents for this company
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_company", (q) => q.eq("companyId", args.id))
      .collect();
    const hasOtherUsersDocuments = documents.some(
      (doc) => doc.uploadedBy && doc.uploadedBy !== userId
    );
    if (hasOtherUsersDocuments) {
      throw new Error("Andre brukere har dokumenter knyttet til dette selskapet");
    }

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

    // Delete documents and their storage files (reuse query from ownership check)
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

    // Delete watchlist entries
    const watchlistEntries = await ctx.db
      .query("watchlist")
      .withIndex("by_company", (q) => q.eq("companyId", args.id))
      .collect();
    for (const entry of watchlistEntries) {
      await ctx.db.delete(entry._id);
    }

    // Delete the company itself
    await ctx.db.delete(args.id);
  },
});
