import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    nameConfirmed: v.optional(v.boolean()),
  }),

  companies: defineTable({
    name: v.string(),
    ticker: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }),

  documents: defineTable({
    companyId: v.id("companies"),
    fileName: v.string(),
    fileId: v.optional(v.id("_storage")),
    r2Key: v.optional(v.string()),
    reportType: v.string(),
    period: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    markdownFileId: v.optional(v.id("_storage")),
    currency: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    unitEvidence: v.optional(v.string()),
    periodScope: v.optional(v.string()),  // "standalone" | "cumulative"
    periodEvidence: v.optional(v.string()),
    normalizationWarning: v.optional(v.string()),
    extractionQuality: v.optional(v.number()),
    createdAt: v.number(),
    uploadedBy: v.optional(v.id("users")),
  }).index("by_company", ["companyId"]),

  chunks: defineTable({
    documentId: v.id("documents"),
    companyId: v.id("companies"),
    content: v.string(),
    embedding: v.array(v.float64()),
    chunkIndex: v.number(),
    pageRange: v.optional(v.string()),
  })
    .index("by_document", ["documentId"])
    .index("by_company", ["companyId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["companyId"],
    }),

  financialMetrics: defineTable({
    documentId: v.id("documents"),
    companyId: v.id("companies"),
    period: v.string(),
    category: v.string(),
    metricName: v.string(),
    value: v.number(),
    unit: v.string(),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_company", ["companyId"])
    .index("by_company_metric", ["companyId", "metricName"]),

  chatSessions: defineTable({
    companyId: v.id("companies"),
    userId: v.optional(v.id("users")),
    title: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_user", ["companyId", "userId"]),

  chatMessages: defineTable({
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
    chart: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  watchlist: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
  })
    .index("by_user", ["userId"])
    .index("by_company", ["companyId"])
    .index("by_user_company", ["userId", "companyId"]),

  feedback: defineTable({
    category: v.union(
      v.literal("bug"),
      v.literal("feature"),
      v.literal("general")
    ),
    description: v.string(),
    stepsToReproduce: v.optional(v.string()),
    pageUrl: v.string(),
    userEmail: v.string(),
    userAgent: v.string(),
    screenshotId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_category", ["category"]),
});
