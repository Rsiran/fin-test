import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("chatSessions")
      .withIndex("by_company_user", (q) =>
        q.eq("companyId", args.companyId).eq("userId", userId)
      )
      .order("desc")
      .collect();
  },
});

export const updateTitle = mutation({
  args: { sessionId: v.id("chatSessions"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("Ingen tilgang til denne økten");
    }

    await ctx.db.patch(args.sessionId, { title: args.title });
  },
});

export const create = mutation({
  args: { companyId: v.id("companies"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    return await ctx.db.insert("chatSessions", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});
