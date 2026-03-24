import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const generateScreenshotUploadUrl = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    category: v.union(
      v.literal("bug"),
      v.literal("feature"),
      v.literal("general")
    ),
    description: v.string(),
    stepsToReproduce: v.optional(v.string()),
    pageUrl: v.string(),
    userAgent: v.string(),
    screenshotId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Get email from auth identity (server-side, not client-trusted)
    const identity = await ctx.auth.getUserIdentity();
    const userEmail = identity?.email ?? "ukjent";

    const feedbackId = await ctx.db.insert("feedback", {
      ...args,
      userEmail,
      createdAt: Date.now(),
    });

    // Get screenshot URL if present
    let screenshotUrl: string | null = null;
    if (args.screenshotId) {
      screenshotUrl = await ctx.storage.getUrl(args.screenshotId);
    }

    // Schedule Slack notification (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.feedbackActions.sendSlackNotification,
      {
        category: args.category,
        description: args.description,
        stepsToReproduce: args.stepsToReproduce,
        pageUrl: args.pageUrl,
        userEmail,
        userAgent: args.userAgent,
        screenshotUrl: screenshotUrl ?? undefined,
      }
    );

    return feedbackId;
  },
});
