import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listBySession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) return [];

    return await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const create = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    role: v.string(),
    content: v.string(),
    sources: v.optional(
      v.array(
        v.object({
          chunkId: v.id("chunks"),
          content: v.string(),
          pageRange: v.optional(v.string()),
        })
      )
    ),
    chart: v.optional(v.object({
      type: v.union(v.literal("bar"), v.literal("line")),
      title: v.string(),
      labels: v.array(v.string()),
      datasets: v.array(v.object({
        label: v.string(),
        values: v.array(v.number()),
      })),
      unit: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Verify session ownership
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("Ingen tilgang til denne økten");
    }

    return await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
