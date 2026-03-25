import { query } from "./_generated/server";
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
    return {
      name: user.name as string | undefined,
      email: user.email as string | undefined,
      nameConfirmed: (user.nameConfirmed as boolean) ?? false,
    };
  },
});
