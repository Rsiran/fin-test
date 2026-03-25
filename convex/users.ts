import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const me = query({
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

export const meProfile = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = user as any;
    return {
      name: doc.name as string | undefined,
      email: doc.email as string | undefined,
      nameConfirmed: (doc.nameConfirmed as boolean) ?? false,
    };
  },
});

export const setName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const trimmed = args.name.trim();
    if (trimmed.length === 0) throw new Error("Name cannot be empty");
    if (trimmed.length > 50) throw new Error("Name too long");

    await ctx.db.patch(userId, {
      name: trimmed,
      nameConfirmed: true,
    } as any);
  },
});
