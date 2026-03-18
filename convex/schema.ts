import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    ticker: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }),

  documents: defineTable({
    companyId: v.id("companies"),
    fileName: v.string(),
    fileId: v.id("_storage"),
    reportType: v.string(),
    period: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    markdownFileId: v.optional(v.id("_storage")),
    createdAt: v.number(),
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
    .index("by_company", ["companyId"])
    .index("by_company_metric", ["companyId", "metricName"]),

  chatSessions: defineTable({
    companyId: v.id("companies"),
    title: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_company", ["companyId"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.string(),
    content: v.string(),
    sources: v.optional(v.array(v.object({
      chunkId: v.id("chunks"),
      content: v.string(),
      pageRange: v.optional(v.string()),
    }))),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
});
