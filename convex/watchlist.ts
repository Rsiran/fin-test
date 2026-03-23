import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listByUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const add = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Check if already watching
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("watchlist", {
      userId,
      companyId: args.companyId,
    });
  },
});

export const remove = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    const entry = await ctx.db
      .query("watchlist")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .first();

    if (entry) await ctx.db.delete(entry._id);
  },
});

export const isWatching = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const entry = await ctx.db
      .query("watchlist")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .first();

    return !!entry;
  },
});
