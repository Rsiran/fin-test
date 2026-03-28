import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Verify user owns every referenced document and companyIds match
    for (const metric of args.metrics) {
      const doc = await ctx.db.get(metric.documentId);
      if (!doc || doc.uploadedBy !== userId) {
        throw new Error("Ingen tilgang til dette dokumentet");
      }
      if (doc.companyId !== metric.companyId) {
        throw new Error("companyId samsvarer ikke med dokumentet");
      }
    }

    for (const metric of args.metrics) {
      await ctx.db.insert("financialMetrics", {
        ...metric,
        createdAt: Date.now(),
      });
    }
  },
});

// Derived ratios computed from absolute metrics at query time.
// Only added when the stored metrics don't already include them.
const DERIVED_RATIOS: {
  name: string;
  numerator: string;
  denominator: string;
  category: string;
}[] = [
  { name: "driftsmargin", numerator: "driftsresultat", denominator: "driftsinntekter", category: "nøkkeltall" },
  { name: "ebitda_margin", numerator: "ebitda", denominator: "driftsinntekter", category: "nøkkeltall" },
  { name: "netto_margin", numerator: "aarsresultat", denominator: "driftsinntekter", category: "nøkkeltall" },
];

export const getByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const stored = await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    // Compute derived ratios from absolute values
    const periods = [...new Set(stored.map((m) => m.period))];
    const derived: typeof stored = [];

    for (const period of periods) {
      const periodMetrics = stored.filter((m) => m.period === period);
      for (const ratio of DERIVED_RATIOS) {
        // Skip if already stored (case-insensitive)
        if (periodMetrics.some((m) => m.metricName.toLowerCase() === ratio.name)) continue;
        const num = periodMetrics.find((m) => m.metricName.toLowerCase() === ratio.numerator);
        const den = periodMetrics.find((m) => m.metricName.toLowerCase() === ratio.denominator);
        if (!num || !den || den.value === 0) continue;
        derived.push({
          _id: `derived_${ratio.name}_${period}` as typeof stored[0]["_id"],
          _creationTime: 0,
          documentId: num.documentId,
          companyId: args.companyId,
          period,
          category: ratio.category,
          metricName: ratio.name,
          value: Math.round((num.value / den.value) * 1000) / 10,
          unit: "%",
          createdAt: 0,
        });
      }
    }

    return [...stored, ...derived];
  },
});

export const getByCompanyAndMetric = query({
  args: {
    companyId: v.id("companies"),
    metricName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("financialMetrics")
      .withIndex("by_company_metric", (q) =>
        q.eq("companyId", args.companyId).eq("metricName", args.metricName)
      )
      .collect();
  },
});
