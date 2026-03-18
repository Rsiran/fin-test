import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const insertBatch = mutation({
  args: {
    metrics: v.array(v.object({
      documentId: v.id("documents"),
      companyId: v.id("companies"),
      period: v.string(),
      category: v.string(),
      metricName: v.string(),
      value: v.number(),
      unit: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const metric of args.metrics) {
      await ctx.db.insert("financialMetrics", {
        ...metric,
        createdAt: Date.now(),
      });
    }
  },
});

export const getByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const getByCompanyAndMetric = query({
  args: {
    companyId: v.id("companies"),
    metricName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("financialMetrics")
      .withIndex("by_company_metric", (q) =>
        q.eq("companyId", args.companyId).eq("metricName", args.metricName)
      )
      .collect();
  },
});
