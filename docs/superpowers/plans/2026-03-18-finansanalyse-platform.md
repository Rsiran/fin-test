# FinansAnalyse Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Norwegian financial report analysis platform that converts PDFs to structured data, displays financial dashboards with charts, and provides RAG-powered chat.

**Architecture:** Next.js 15 (App Router) handles the UI and API routes. Convex provides the database, file storage, and vector search. opendataloader-pdf (Java) converts PDFs to Markdown. OpenAI GPT-4o powers financial data extraction and chat. Single deployment on Oracle Cloud Free Tier.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, Recharts, Convex, opendataloader-pdf, OpenAI API (GPT-4o + text-embedding-3-small)

**Spec:** `docs/superpowers/specs/2026-03-18-finance-rag-platform-design.md`

---

## File Structure

```
finance-test/
├── app/
│   ├── layout.tsx                          # Root layout with ConvexProvider, Norwegian lang tag
│   ├── page.tsx                            # Home: company list + add company
│   ├── selskap/
│   │   └── [id]/
│   │       └── page.tsx                    # Company dashboard (tabs: Oversikt, Dokumenter, Chat)
│   ├── api/
│   │   ├── upload/
│   │   │   └── route.ts                    # PDF upload + processing pipeline
│   │   └── chat/
│   │       └── route.ts                    # Streaming RAG chat
│   └── globals.css                         # Tailwind imports
├── components/
│   ├── company-list.tsx                    # Company cards grid
│   ├── add-company-dialog.tsx              # Modal for adding company
│   ├── upload-dropzone.tsx                 # Batch drag-and-drop PDF upload
│   ├── chat-interface.tsx                  # Chat UI with streaming + sources
│   └── dashboard/
│       ├── tabs.tsx                        # Tab navigation (Oversikt/Dokumenter/Chat)
│       ├── overview-tab.tsx                # KPIs + charts layout
│       ├── documents-tab.tsx               # Document list + upload zone
│       ├── chat-tab.tsx                    # Chat wrapper for dashboard context
│       ├── kpi-card.tsx                    # Single KPI with change indicator
│       ├── revenue-chart.tsx               # Bar/line chart for revenue
│       ├── margins-chart.tsx               # Multi-line margins chart
│       ├── cashflow-chart.tsx              # Cash flow visualization
│       └── comparison-table.tsx            # Metrics table across periods
├── convex/
│   ├── schema.ts                           # Full Convex schema (6 tables)
│   ├── companies.ts                        # Company CRUD mutations + queries
│   ├── documents.ts                        # Document mutations + queries
│   ├── chunks.ts                           # Chunk storage + vector search query
│   ├── financialMetrics.ts                 # Metrics storage + dashboard queries
│   ├── chatSessions.ts                     # Chat session mutations + queries
│   └── chatMessages.ts                     # Chat message mutations + queries
├── lib/
│   ├── pdf-processor.ts                    # opendataloader-pdf Java subprocess wrapper
│   ├── chunker.ts                          # Markdown → chunks (heading-based splitting)
│   ├── embeddings.ts                       # OpenAI text-embedding-3-small wrapper
│   ├── financial-extractor.ts              # GPT-4o structured extraction + validation
│   ├── period-format.ts                    # Period canonicalization (YYYY-QN, YYYY-FY)
│   └── openai.ts                           # Shared OpenAI client instance
├── __tests__/
│   ├── chunker.test.ts                     # Chunking logic tests
│   ├── financial-extractor.test.ts         # Extraction validation tests
│   └── period-format.test.ts               # Period canonicalization tests
├── convex.json                             # Convex config (created by npx convex dev)
├── next.config.ts                          # Next.js config
├── tailwind.config.ts                      # Tailwind config
├── tsconfig.json                           # TypeScript config
├── package.json                            # Dependencies
└── .env.local                              # CONVEX_URL, OPENAI_API_KEY
```

---

## Task 1: Project Scaffolding

**Files:**
- Recreate: `package.json`
- Create: `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `postcss.config.mjs`

This task sets up Next.js 15 with Tailwind CSS and all dependencies in the existing project directory. Since the current project is nearly empty (just a bare package.json and empty convex/), we scaffold Next.js into it.

- [ ] **Step 1: Initialize Next.js project**

Run from the project root. This replaces the bare package.json with a full Next.js project:

```bash
cd /Users/jonas/Desktop/Projects/finance-test
# Back up .env.local (has CONVEX_URL)
cp .env.local .env.local.bak
# Remove current minimal files to allow clean scaffold
rm package.json
rm -rf node_modules convex
# Create Next.js project in current directory
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --yes
# Restore .env.local
cp .env.local.bak .env.local && rm .env.local.bak
```

Expected: Next.js project created with `app/` directory, `tailwind.config.ts`, `tsconfig.json`, etc.

- [ ] **Step 2: Install all dependencies**

```bash
cd /Users/jonas/Desktop/Projects/finance-test
npm install convex openai recharts @opendataloader/pdf
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Configure Convex in Next.js**

Update `app/layout.tsx` to wrap the app in ConvexProvider:

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import { ConvexClientProvider } from "./convex-client-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinansAnalyse",
  description: "Analyser norske selskaper gjennom finansrapporter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="no">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

Create `app/convex-client-provider.tsx`:

```tsx
"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexClientProvider>;
}
```

- [ ] **Step 4: Add OPENAI_API_KEY to .env.local**

Append to existing `.env.local`:

```
OPENAI_API_KEY=sk-your-key-here
```

Note: The `NEXT_PUBLIC_CONVEX_URL` should already be set from the earlier `npx convex dev` setup. Verify it exists.

- [ ] **Step 5: Create placeholder home page**

```tsx
// app/page.tsx
export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">FinansAnalyse</h1>
      <p className="mt-2 text-gray-500">Analyser norske selskaper gjennom finansrapporter</p>
    </main>
  );
}
```

- [ ] **Step 6: Verify dev server starts**

```bash
cd /Users/jonas/Desktop/Projects/finance-test
npm run dev
```

Expected: Next.js dev server starts on http://localhost:3000, shows the placeholder page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with Tailwind, Convex, and dependencies"
```

---

## Task 2: Convex Schema & Base Functions

**Files:**
- Create: `convex/schema.ts`
- Create: `convex/companies.ts`
- Create: `convex/documents.ts`
- Create: `convex/chunks.ts`
- Create: `convex/financialMetrics.ts`
- Create: `convex/chatSessions.ts`
- Create: `convex/chatMessages.ts`

- [ ] **Step 1: Define the full Convex schema**

```ts
// convex/schema.ts
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
```

- [ ] **Step 2: Create company CRUD functions**

```ts
// convex/companies.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("companies").collect();
  },
});

export const get = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    ticker: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("companies", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 3: Create document functions**

```ts
// convex/documents.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const create = mutation({
  args: {
    companyId: v.id("companies"),
    fileName: v.string(),
    fileId: v.id("_storage"),
    reportType: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      ...args,
      status: "processing",
      createdAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("documents"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    markdownFileId: v.optional(v.id("_storage")),
    reportType: v.optional(v.string()),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    // Remove undefined fields before patching
    const patch: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    // Delete associated chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
    // Delete associated metrics
    const doc = await ctx.db.get(args.id);
    if (doc) {
      const metrics = await ctx.db
        .query("financialMetrics")
        .withIndex("by_company", (q) => q.eq("companyId", doc.companyId))
        .filter((q) => q.eq(q.field("documentId"), args.id))
        .collect();
      for (const metric of metrics) {
        await ctx.db.delete(metric._id);
      }
    }
    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
```

- [ ] **Step 4: Create chunk functions with vector search**

```ts
// convex/chunks.ts
import { mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const insert = mutation({
  args: {
    documentId: v.id("documents"),
    companyId: v.id("companies"),
    content: v.string(),
    embedding: v.array(v.float64()),
    chunkIndex: v.number(),
    pageRange: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chunks", args);
  },
});

export const search = action({
  args: {
    companyId: v.id("companies"),
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 8,
      filter: (q) => q.eq("companyId", args.companyId),
    });
    // Fetch full chunk documents
    const chunks = await Promise.all(
      results.map(async (result) => {
        const chunk = await ctx.runQuery(api.chunks.getById, { id: result._id });
        return { ...chunk, score: result._score };
      })
    );
    return chunks;
  },
});

export const getById = query({
  args: { id: v.id("chunks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
```

- [ ] **Step 5: Create financial metrics functions**

```ts
// convex/financialMetrics.ts
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
```

- [ ] **Step 6: Create chat functions**

```ts
// convex/chatSessions.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: { companyId: v.id("companies"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatSessions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

```ts
// convex/chatMessages.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listBySession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
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
    sources: v.optional(v.array(v.object({
      chunkId: v.id("chunks"),
      content: v.string(),
      pageRange: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 7: Run `npx convex dev` to push schema**

```bash
npx convex dev
```

Expected: Schema pushes successfully, all tables created.

- [ ] **Step 8: Commit**

```bash
git add convex/
git commit -m "feat: add Convex schema and base functions for all 6 tables"
```

---

## Task 3: Home Page — Company List & Add Company

**Files:**
- Create: `components/company-list.tsx`
- Create: `components/add-company-dialog.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Build the company list component**

```tsx
// components/company-list.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export function CompanyList() {
  const companies = useQuery(api.companies.list);

  if (companies === undefined) {
    return <div className="text-gray-500">Laster selskaper...</div>;
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">Ingen selskaper lagt til ennå</p>
        <p className="text-sm mt-1">Legg til et selskap for å komme i gang</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {companies.map((company) => (
        <Link
          key={company._id}
          href={`/selskap/${company._id}`}
          className="block p-6 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all"
        >
          <h3 className="text-lg font-semibold">{company.name}</h3>
          {company.ticker && (
            <span className="text-sm text-gray-500">{company.ticker}</span>
          )}
          {company.description && (
            <p className="text-sm text-gray-600 mt-2">{company.description}</p>
          )}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build the add company dialog**

```tsx
// components/add-company-dialog.tsx
"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export function AddCompanyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createCompany = useMutation(api.companies.create);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createCompany({
      name: name.trim(),
      ticker: ticker.trim() || undefined,
    });
    setName("");
    setTicker("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Legg til selskap</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Selskapsnavn *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="f.eks. Equinor ASA"
              className="w-full border rounded-md px-3 py-2"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ticker (valgfritt)</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="f.eks. EQNR"
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Legg til
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire up the home page**

```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import { CompanyList } from "@/components/company-list";
import { AddCompanyDialog } from "@/components/add-company-dialog";

export default function Home() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">FinansAnalyse</h1>
          <p className="mt-1 text-gray-500">
            Analyser norske selskaper gjennom finansrapporter
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Legg til selskap
        </button>
      </div>
      <CompanyList />
      <AddCompanyDialog open={showDialog} onClose={() => setShowDialog(false)} />
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Expected: Home page loads, shows empty state. Clicking "Legg til selskap" opens modal, creating a company shows it in the grid. Clicking a company navigates to `/selskap/[id]`.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/
git commit -m "feat: add home page with company list and add company dialog"
```

---

## Task 4: Processing Pipeline — PDF Conversion & Chunking

**Files:**
- Create: `lib/pdf-processor.ts`
- Create: `lib/chunker.ts`
- Create: `lib/period-format.ts`
- Create: `__tests__/chunker.test.ts`
- Create: `__tests__/period-format.test.ts`

- [ ] **Step 1: Write failing tests for period format canonicalization**

```ts
// __tests__/period-format.test.ts
import { describe, it, expect } from "vitest";
import { canonicalizePeriod } from "../lib/period-format";

describe("canonicalizePeriod", () => {
  it("parses quarterly formats", () => {
    expect(canonicalizePeriod("Q1 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("Q4 2024")).toBe("2024-Q4");
    expect(canonicalizePeriod("1. kvartal 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("første kvartal 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("tredje kvartal 2024")).toBe("2024-Q3");
  });

  it("parses annual formats", () => {
    expect(canonicalizePeriod("FY 2024")).toBe("2024-FY");
    expect(canonicalizePeriod("Årsrapport 2024")).toBe("2024-FY");
    expect(canonicalizePeriod("2024")).toBe("2024-FY");
  });

  it("parses half-year formats", () => {
    expect(canonicalizePeriod("H1 2025")).toBe("2025-H1");
    expect(canonicalizePeriod("halvårsrapport 2025")).toBe("2025-H1");
  });

  it("returns input unchanged if unrecognized", () => {
    expect(canonicalizePeriod("unknown format")).toBe("unknown format");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/period-format.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement period format canonicalization**

```ts
// lib/period-format.ts
const quarterWords: Record<string, string> = {
  "første": "1", "andre": "2", "tredje": "3", "fjerde": "4",
  "1.": "1", "2.": "2", "3.": "3", "4.": "4",
};

export function canonicalizePeriod(input: string): string {
  const s = input.trim().toLowerCase();

  // "Q1 2025" or "Q4 2024"
  const qMatch = s.match(/q(\d)\s*(\d{4})/);
  if (qMatch) return `${qMatch[2]}-Q${qMatch[1]}`;

  // "1. kvartal 2025" or "første kvartal 2025"
  const kvMatch = s.match(/(\S+)\s*kvartal\s*(\d{4})/);
  if (kvMatch) {
    const q = quarterWords[kvMatch[1]] ?? kvMatch[1];
    if (/^[1-4]$/.test(q)) return `${kvMatch[2]}-Q${q}`;
  }

  // "H1 2025" or "H2 2025"
  const hMatch = s.match(/h([12])\s*(\d{4})/);
  if (hMatch) return `${hMatch[2]}-H${hMatch[1]}`;

  // "halvårsrapport 2025"
  const halvMatch = s.match(/halvårsrapport\s*(\d{4})/);
  if (halvMatch) return `${halvMatch[1]}-H1`;

  // "FY 2024"
  const fyMatch = s.match(/fy\s*(\d{4})/);
  if (fyMatch) return `${fyMatch[1]}-FY`;

  // "Årsrapport 2024"
  const arsMatch = s.match(/årsrapport\s*(\d{4})/);
  if (arsMatch) return `${arsMatch[1]}-FY`;

  // Bare year "2024"
  const yearMatch = s.match(/^(\d{4})$/);
  if (yearMatch) return `${yearMatch[1]}-FY`;

  return input;
}

export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/period-format.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Write failing tests for chunker**

```ts
// __tests__/chunker.test.ts
import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "../lib/chunker";

describe("chunkMarkdown", () => {
  it("splits on headings", () => {
    const md = "# Section 1\n\nContent one.\n\n# Section 2\n\nContent two.";
    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(2);
    expect(chunks[0].content).toContain("Section 1");
    expect(chunks[1].content).toContain("Section 2");
  });

  it("keeps tables as whole chunks", () => {
    const md = "# Data\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nMore text.";
    const chunks = chunkMarkdown(md);
    const tableChunk = chunks.find((c) => c.content.includes("| A |"));
    expect(tableChunk).toBeDefined();
    expect(tableChunk!.content).toContain("| 3 | 4 |");
  });

  it("assigns sequential chunk indices", () => {
    const md = "# A\n\nText A\n\n# B\n\nText B\n\n# C\n\nText C";
    const chunks = chunkMarkdown(md);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("handles empty input", () => {
    const chunks = chunkMarkdown("");
    expect(chunks).toEqual([]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run __tests__/chunker.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement the markdown chunker**

```ts
// lib/chunker.ts
export interface Chunk {
  content: string;
  chunkIndex: number;
}

const MAX_CHUNK_TOKENS = 1000;
const OVERLAP_TOKENS = 200;
// Rough approximation: 1 token ≈ 4 chars
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

export function chunkMarkdown(markdown: string): Chunk[] {
  if (!markdown.trim()) return [];

  // Split on headings (h1, h2, h3)
  const sections = splitOnHeadings(markdown);

  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    // If section fits in one chunk, keep it whole
    if (section.length <= MAX_CHARS) {
      chunks.push({ content: section.trim(), chunkIndex: index++ });
    } else {
      // Split large sections on paragraph boundaries, but never split tables
      const subChunks = splitLargeSection(section);
      for (const sub of subChunks) {
        chunks.push({ content: sub.trim(), chunkIndex: index++ });
      }
    }
  }

  return chunks;
}

function splitOnHeadings(markdown: string): string[] {
  // Split before # headings, keeping the heading with its content
  const parts = markdown.split(/(?=^#{1,3}\s)/m);
  return parts.filter((p) => p.trim().length > 0);
}

function splitLargeSection(section: string): string[] {
  const paragraphs = section.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    // Never split a table — if a paragraph contains a table, keep it whole
    const isTable = para.includes("|") && para.includes("---");

    if (current.length + para.length > MAX_CHARS && current.length > 0) {
      chunks.push(current);
      // Add overlap from end of previous chunk
      const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;
      const overlap = current.slice(-overlapChars);
      current = overlap + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run __tests__/chunker.test.ts
```

Expected: All tests PASS.

- [ ] **Step 9: Implement the PDF processor wrapper**

```ts
// lib/pdf-processor.ts
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export async function convertPdfToMarkdown(pdfBuffer: Buffer): Promise<string> {
  // Create temp directory for input/output
  const tempDir = await mkdtemp(join(tmpdir(), "finansanalyse-"));
  const inputPath = join(tempDir, "input.pdf");
  const outputDir = join(tempDir, "output");

  try {
    // Write PDF to temp file
    const { writeFile, mkdir } = await import("fs/promises");
    await writeFile(inputPath, pdfBuffer);
    await mkdir(outputDir, { recursive: true });

    // Run opendataloader-pdf
    await execFileAsync("npx", [
      "@opendataloader/pdf",
      inputPath,
      "--output", outputDir,
      "--format", "markdown",
    ], {
      timeout: 120000, // 2 min timeout
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    // Read the output markdown
    const files = await import("fs/promises").then((fs) => fs.readdir(outputDir));
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) throw new Error("No markdown output generated");

    return await readFile(join(outputDir, mdFile), "utf-8");
  } finally {
    // Clean up temp files
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 10: Add vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 11: Commit**

```bash
git add lib/ __tests__/ vitest.config.ts
git commit -m "feat: add PDF processor, markdown chunker, and period format utils with tests"
```

---

## Task 5: OpenAI Integration — Embeddings & Financial Extraction

**Files:**
- Create: `lib/openai.ts`
- Create: `lib/embeddings.ts`
- Create: `lib/financial-extractor.ts`
- Create: `__tests__/financial-extractor.test.ts`

- [ ] **Step 1: Create shared OpenAI client**

```ts
// lib/openai.ts
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

- [ ] **Step 2: Create embeddings wrapper**

```ts
// lib/embeddings.ts
import { openai } from "./openai";

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // OpenAI supports batch embedding (up to 2048 inputs)
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
```

- [ ] **Step 3: Write failing tests for financial extraction validation**

```ts
// __tests__/financial-extractor.test.ts
import { describe, it, expect } from "vitest";
import { validateMetrics, type ExtractedMetric } from "../lib/financial-extractor";

describe("validateMetrics", () => {
  it("accepts valid metrics", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "driftsinntekter", value: 342.8, unit: "MNOK", category: "resultat", confidence: "high" },
      { metricName: "driftsmargin", value: 26.0, unit: "%", category: "nøkkeltall", confidence: "high" },
    ];
    const result = validateMetrics(metrics);
    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects negative revenue", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "driftsinntekter", value: -100, unit: "MNOK", category: "resultat", confidence: "high" },
    ];
    const result = validateMetrics(metrics);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects margins outside -100% to 100%", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "driftsmargin", value: 150, unit: "%", category: "nøkkeltall", confidence: "high" },
    ];
    const result = validateMetrics(metrics);
    expect(result.rejected).toHaveLength(1);
  });

  it("flags low-confidence metrics", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "ebitda", value: 89.2, unit: "MNOK", category: "resultat", confidence: "low" },
    ];
    const result = validateMetrics(metrics);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].flagged).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run __tests__/financial-extractor.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement financial extractor**

```ts
// lib/financial-extractor.ts
import { openai } from "./openai";
import { canonicalizePeriod } from "./period-format";

export interface ExtractedMetric {
  metricName: string;
  value: number;
  unit: string;
  category: string;
  confidence: "high" | "medium" | "low";
  flagged?: boolean;
}

export interface ExtractionResult {
  period: string;
  reportType: string;
  metrics: ExtractedMetric[];
}

export interface ValidationResult {
  valid: ExtractedMetric[];
  rejected: { metric: ExtractedMetric; reason: string }[];
}

const MARGIN_METRICS = [
  "driftsmargin", "ebitda-margin", "netto_margin",
];

const NON_NEGATIVE_METRICS = [
  "driftsinntekter", "sum_eiendeler", "egenkapital",
];

export function validateMetrics(metrics: ExtractedMetric[]): ValidationResult {
  const valid: ExtractedMetric[] = [];
  const rejected: { metric: ExtractedMetric; reason: string }[] = [];

  for (const metric of metrics) {
    // Check margins are within -100% to 100%
    if (metric.unit === "%" && Math.abs(metric.value) > 100) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value}% exceeds ±100%` });
      continue;
    }

    // Check non-negative metrics
    if (NON_NEGATIVE_METRICS.includes(metric.metricName) && metric.value < 0) {
      rejected.push({ metric, reason: `${metric.metricName}: unexpected negative value ${metric.value}` });
      continue;
    }

    // Flag low-confidence
    if (metric.confidence === "low") {
      valid.push({ ...metric, flagged: true });
    } else {
      valid.push(metric);
    }
  }

  return { valid, rejected };
}

const EXTRACTION_PROMPT = `Du er en ekspert på norsk finansanalyse. Analyser følgende rapport og ekstraher alle tilgjengelige finansielle nøkkeltall.

Returner et JSON-objekt med denne strukturen:
{
  "period": "<rapporteringsperiode, f.eks. 'Q1 2025' eller 'Årsrapport 2024'>",
  "reportType": "<årsrapport|kvartalsrapport|prospekt|børsmelding|annet>",
  "metrics": [
    {
      "metricName": "<norsk navn>",
      "value": <numerisk verdi>,
      "unit": "<NOK|MNOK|BNOK|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
}

Bruk disse metrikknavnene der tilgjengelig:
- resultat: driftsinntekter, driftsresultat, ebitda, resultat_for_skatt, aarsresultat, resultat_per_aksje
- balanse: sum_eiendeler, egenkapital, total_gjeld, kontanter, egenkapitalandel
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad

Returner KUN gyldig JSON, ingen annen tekst.`;

export async function extractFinancialData(markdown: string): Promise<ExtractionResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: markdown },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Empty response from GPT-4o");

  const parsed = JSON.parse(content);
  const period = canonicalizePeriod(parsed.period || "");
  const reportType = parsed.reportType || "annet";

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

  if (rejected.length > 0) {
    console.warn("Rejected metrics:", rejected);
  }

  return {
    period,
    reportType,
    metrics: valid,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run __tests__/financial-extractor.test.ts
```

Expected: All tests PASS (validation tests are unit tests that don't call OpenAI).

- [ ] **Step 7: Commit**

```bash
git add lib/ __tests__/
git commit -m "feat: add OpenAI embeddings, financial data extraction, and validation"
```

---

## Task 6: Upload API Route & Processing Pipeline

**Files:**
- Create: `app/api/upload/route.ts`

This wires together: file upload → Convex storage → opendataloader-pdf → chunking → embeddings → financial extraction → store everything.

- [ ] **Step 1: Implement the upload API route**

```ts
// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { convertPdfToMarkdown } from "@/lib/pdf-processor";
import { chunkMarkdown } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { extractFinancialData } from "@/lib/financial-extractor";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyId = formData.get("companyId") as string;
    const files = formData.getAll("files") as File[];

    if (!companyId || files.length === 0) {
      return NextResponse.json(
        { error: "companyId and files are required" },
        { status: 400 }
      );
    }

    const results = [];

    for (const file of files) {
      try {
        // 1. Upload PDF to Convex storage
        const uploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await uploadResponse.json();

        // 2. Create document record (status: processing)
        const docId = await convex.mutation(api.documents.create, {
          companyId: companyId as any,
          fileName: file.name,
          fileId: storageId,
          reportType: "annet", // Will be updated by extraction
          period: "unknown",   // Will be updated by extraction
        });

        // 3. Convert PDF to Markdown
        const pdfBuffer = Buffer.from(await file.arrayBuffer());
        const markdown = await convertPdfToMarkdown(pdfBuffer);

        // 4. Store markdown in Convex file storage
        const mdUploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const mdUploadResponse = await fetch(mdUploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: markdown,
        });
        const { storageId: mdStorageId } = await mdUploadResponse.json();

        // 5. Run both paths in parallel
        const [extractionResult, chunks] = await Promise.all([
          // Path 2: Financial extraction
          extractFinancialData(markdown),
          // Path 1: Chunking (embeddings come after)
          Promise.resolve(chunkMarkdown(markdown)),
        ]);

        // 6. Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

        // 7. Store chunks with embeddings in Convex
        for (let i = 0; i < chunks.length; i++) {
          await convex.mutation(api.chunks.insert, {
            documentId: docId,
            companyId: companyId as any,
            content: chunks[i].content,
            embedding: embeddings[i],
            chunkIndex: chunks[i].chunkIndex,
          });
        }

        // 8. Store financial metrics
        if (extractionResult.metrics.length > 0) {
          await convex.mutation(api.financialMetrics.insertBatch, {
            metrics: extractionResult.metrics.map((m) => ({
              documentId: docId,
              companyId: companyId as any,
              period: extractionResult.period,
              category: m.category,
              metricName: m.metricName,
              value: m.value,
              unit: m.unit,
            })),
          });
        }

        // 9. Update document status to ready + write back extracted period/type
        await convex.mutation(api.documents.updateStatus, {
          id: docId,
          status: "ready",
          markdownFileId: mdStorageId,
          period: extractionResult.period,
          reportType: extractionResult.reportType ?? "annet",
        });

        results.push({ fileName: file.name, status: "ready", docId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push({ fileName: file.name, status: "error", error: errorMessage });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Test with a sample PDF manually**

Use curl or the browser to test uploading a PDF. This requires `npx convex dev` running in another terminal.

```bash
# Start Convex in one terminal
npx convex dev

# Start Next.js in another
npm run dev

# Test with curl (replace IDs)
# First create a company via the UI, then:
curl -X POST http://localhost:3000/api/upload \
  -F "companyId=YOUR_COMPANY_ID" \
  -F "files=@sample-report.pdf"
```

Expected: Returns JSON with processing results per file.

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/
git commit -m "feat: add PDF upload API route with full processing pipeline"
```

---

## Task 7: Upload UI — Batch Drag-and-Drop

**Files:**
- Create: `components/upload-dropzone.tsx`

- [ ] **Step 1: Build the upload dropzone component**

```tsx
// components/upload-dropzone.tsx
"use client";

import { useState, useCallback } from "react";
import { Id } from "@/convex/_generated/dataModel";

interface UploadResult {
  fileName: string;
  status: "uploading" | "ready" | "error";
  error?: string;
}

export function UploadDropzone({ companyId }: { companyId: Id<"companies"> }) {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf"
    );
    if (pdfFiles.length === 0) return;

    setIsUploading(true);
    setResults(pdfFiles.map((f) => ({ fileName: f.name, status: "uploading" })));

    const formData = new FormData();
    formData.append("companyId", companyId);
    for (const file of pdfFiles) {
      formData.append("files", file);
    }

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      setResults(
        data.results.map((r: any) => ({
          fileName: r.fileName,
          status: r.status,
          error: r.error,
        }))
      );
    } catch {
      setResults(pdfFiles.map((f) => ({ fileName: f.name, status: "error", error: "Opplasting feilet" })));
    } finally {
      setIsUploading(false);
    }
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
        }`}
      >
        <p className="text-gray-600">
          {isUploading ? "Prosesserer..." : "Dra og slipp PDF-filer her"}
        </p>
        <p className="text-sm text-gray-400 mt-1">eller</p>
        <label className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700">
          Velg filer
          <input
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-md bg-gray-50">
              <span className={`text-sm font-medium ${
                r.status === "ready" ? "text-green-600" :
                r.status === "error" ? "text-red-600" :
                "text-yellow-600"
              }`}>
                {r.status === "ready" ? "✓" : r.status === "error" ? "✗" : "⏳"}
              </span>
              <span className="text-sm">{r.fileName}</span>
              {r.error && <span className="text-xs text-red-500">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/upload-dropzone.tsx
git commit -m "feat: add batch drag-and-drop PDF upload component"
```

---

## Task 8: Company Dashboard — Tab Navigation & Documents Tab

**Files:**
- Create: `app/selskap/[id]/page.tsx`
- Create: `components/dashboard/tabs.tsx`
- Create: `components/dashboard/documents-tab.tsx`

- [ ] **Step 1: Create the dashboard page with tabs**

```tsx
// app/selskap/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DashboardTabs } from "@/components/dashboard/tabs";
import Link from "next/link";

export default function CompanyPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const company = useQuery(api.companies.get, { id: companyId });

  if (company === undefined) {
    return <div className="p-8 text-gray-500">Laster...</div>;
  }

  if (company === null) {
    return <div className="p-8 text-red-500">Selskap ikke funnet</div>;
  }

  return (
    <main className="min-h-screen">
      {/* Top nav */}
      <div className="border-b px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-blue-600 hover:underline">Mine selskaper</Link>
          <span className="text-gray-400">›</span>
          <span className="font-semibold">{company.name}</span>
          {company.ticker && (
            <span className="text-gray-500">({company.ticker})</span>
          )}
        </div>
      </div>

      <DashboardTabs companyId={companyId} />
    </main>
  );
}
```

- [ ] **Step 2: Create tab navigation component**

```tsx
// components/dashboard/tabs.tsx
"use client";

import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { DocumentsTab } from "./documents-tab";
import { OverviewTab } from "./overview-tab";
import { ChatTab } from "./chat-tab";

const TABS = [
  { id: "oversikt", label: "Oversikt" },
  { id: "dokumenter", label: "Dokumenter" },
  { id: "chat", label: "Chat" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DashboardTabs({ companyId }: { companyId: Id<"companies"> }) {
  const [activeTab, setActiveTab] = useState<TabId>("oversikt");

  return (
    <div>
      <div className="border-b flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-8">
        {activeTab === "oversikt" && <OverviewTab companyId={companyId} />}
        {activeTab === "dokumenter" && <DocumentsTab companyId={companyId} />}
        {activeTab === "chat" && <ChatTab companyId={companyId} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the documents tab**

```tsx
// components/dashboard/documents-tab.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UploadDropzone } from "../upload-dropzone";

export function DocumentsTab({ companyId }: { companyId: Id<"companies"> }) {
  const documents = useQuery(api.documents.listByCompany, { companyId });
  const removeDocument = useMutation(api.documents.remove);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dokumenter</h2>

      <UploadDropzone companyId={companyId} />

      {documents === undefined ? (
        <p className="text-gray-500">Laster dokumenter...</p>
      ) : documents.length === 0 ? (
        <p className="text-gray-500">Ingen dokumenter lastet opp ennå</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Filnavn</th>
              <th className="py-2">Type</th>
              <th className="py-2">Periode</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc._id} className="border-b">
                <td className="py-2">{doc.fileName}</td>
                <td className="py-2">{doc.reportType}</td>
                <td className="py-2">{doc.period}</td>
                <td className="py-2">
                  <span className={`text-xs px-2 py-1 rounded ${
                    doc.status === "ready" ? "bg-green-100 text-green-700" :
                    doc.status === "error" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {doc.status === "ready" ? "Klar" :
                     doc.status === "error" ? "Feil" : "Prosesserer..."}
                  </span>
                </td>
                <td className="py-2">
                  <button
                    onClick={() => removeDocument({ id: doc._id })}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Slett
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder overview and chat tabs**

```tsx
// components/dashboard/overview-tab.tsx
"use client";

import { Id } from "@/convex/_generated/dataModel";

export function OverviewTab({ companyId }: { companyId: Id<"companies"> }) {
  return (
    <div className="text-gray-500">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Oversikt</h2>
      <p>Last opp rapporter under Dokumenter-fanen for å se finansielle nøkkeltall.</p>
    </div>
  );
}
```

```tsx
// components/dashboard/chat-tab.tsx
"use client";

import { Id } from "@/convex/_generated/dataModel";

export function ChatTab({ companyId }: { companyId: Id<"companies"> }) {
  return (
    <div className="text-gray-500">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Chat</h2>
      <p>Chat-funksjonalitet kommer i neste steg.</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Navigate to a company page — tabs should work, documents tab should show upload zone and document list.

- [ ] **Step 6: Commit**

```bash
git add app/selskap/ components/dashboard/
git commit -m "feat: add company dashboard with tab navigation and documents tab"
```

---

## Task 9: Dashboard — Overview Tab with KPIs & Charts

**Files:**
- Create: `components/dashboard/kpi-card.tsx`
- Create: `components/dashboard/revenue-chart.tsx`
- Create: `components/dashboard/margins-chart.tsx`
- Create: `components/dashboard/cashflow-chart.tsx`
- Create: `components/dashboard/comparison-table.tsx`
- Modify: `components/dashboard/overview-tab.tsx`

- [ ] **Step 1: Create the KPI card component**

```tsx
// components/dashboard/kpi-card.tsx
interface KpiCardProps {
  label: string;
  value: string;
  change?: { value: number; label: string };
  color: "blue" | "green" | "yellow" | "purple";
}

const colorMap = {
  blue: "bg-blue-50 border-blue-200",
  green: "bg-green-50 border-green-200",
  yellow: "bg-yellow-50 border-yellow-200",
  purple: "bg-purple-50 border-purple-200",
};

export function KpiCard({ label, value, change, color }: KpiCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="text-xs text-gray-500 uppercase">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {change && (
        <div className={`text-sm mt-1 ${change.value >= 0 ? "text-green-600" : "text-red-600"}`}>
          {change.value >= 0 ? "▲" : "▼"} {Math.abs(change.value).toFixed(1)}% {change.label}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the revenue bar chart**

```tsx
// components/dashboard/revenue-chart.tsx
"use client";

import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

interface RevenueChartProps {
  data: { period: string; value: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-sm">Driftsinntekter (MNOK)</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setChartType("bar")}
            className={`px-2 py-1 text-xs rounded ${
              chartType === "bar" ? "bg-blue-100 text-blue-700" : "text-gray-500"
            }`}
          >
            Søyle
          </button>
          <button
            onClick={() => setChartType("line")}
            className={`px-2 py-1 text-xs rounded ${
              chartType === "line" ? "bg-blue-100 text-blue-700" : "text-gray-500"
            }`}
          >
            Linje
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create the margins line chart**

```tsx
// components/dashboard/margins-chart.tsx
"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface MarginsChartProps {
  data: {
    period: string;
    driftsmargin?: number;
    ebitda_margin?: number;
    netto_margin?: number;
  }[];
}

export function MarginsChart({ data }: MarginsChartProps) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold text-sm mb-4">Marginer (%)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} unit="%" />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="driftsmargin" name="Driftsmargin" stroke="#22c55e" strokeWidth={2} />
          <Line type="monotone" dataKey="ebitda_margin" name="EBITDA" stroke="#f59e0b" strokeWidth={2} />
          <Line type="monotone" dataKey="netto_margin" name="Netto" stroke="#8b5cf6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create the cash flow chart**

```tsx
// components/dashboard/cashflow-chart.tsx
"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface CashflowChartProps {
  data: {
    period: string;
    operasjonell?: number;
    investering?: number;
    fcf?: number;
  }[];
}

export function CashflowChart({ data }: CashflowChartProps) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold text-sm mb-4">Kontantstrøm (MNOK)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="operasjonell" name="Operasjonell" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="investering" name="Investering" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Bar dataKey="fcf" name="FCF" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: Create the comparison table**

```tsx
// components/dashboard/comparison-table.tsx
"use client";

import { sortPeriods } from "@/lib/period-format";

interface ComparisonTableProps {
  metrics: {
    period: string;
    metricName: string;
    value: number;
    unit: string;
  }[];
}

const DISPLAY_METRICS = [
  { key: "driftsinntekter", label: "Driftsinntekter" },
  { key: "ebitda", label: "EBITDA" },
  { key: "driftsmargin", label: "Driftsmargin" },
  { key: "fri_kontantstrom", label: "FCF" },
  { key: "egenkapitalandel", label: "Egenkapitalandel" },
  { key: "aarsresultat", label: "Årsresultat" },
];

export function ComparisonTable({ metrics }: ComparisonTableProps) {
  const periods = sortPeriods([...new Set(metrics.map((m) => m.period))]);

  const getValue = (metricName: string, period: string) => {
    const m = metrics.find((x) => x.metricName === metricName && x.period === period);
    if (!m) return null;
    return m.unit === "%" ? `${m.value.toFixed(1)}%` : m.value.toLocaleString("nb-NO");
  };

  const latestPeriod = periods[periods.length - 1];

  return (
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold text-sm mb-4">Nøkkeltall — Sammenligning</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 text-gray-500">Nøkkeltall</th>
              {periods.map((p) => (
                <th key={p} className="text-right py-2 text-gray-500">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISPLAY_METRICS.map((dm) => (
              <tr key={dm.key} className="border-b">
                <td className="py-2">{dm.label}</td>
                {periods.map((p) => {
                  const val = getValue(dm.key, p);
                  return (
                    <td
                      key={p}
                      className={`text-right py-2 ${
                        p === latestPeriod ? "font-bold text-blue-600" : ""
                      }`}
                    >
                      {val ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire up the overview tab with real data**

Replace the placeholder `overview-tab.tsx`:

```tsx
// components/dashboard/overview-tab.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { KpiCard } from "./kpi-card";
import { RevenueChart } from "./revenue-chart";
import { MarginsChart } from "./margins-chart";
import { CashflowChart } from "./cashflow-chart";
import { ComparisonTable } from "./comparison-table";
import { sortPeriods } from "@/lib/period-format";

export function OverviewTab({ companyId }: { companyId: Id<"companies"> }) {
  const metrics = useQuery(api.financialMetrics.getByCompany, { companyId });

  if (metrics === undefined) return <p className="text-gray-500">Laster...</p>;

  if (metrics.length === 0) {
    return (
      <div className="text-gray-500">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Oversikt</h2>
        <p>Last opp rapporter under Dokumenter-fanen for å se finansielle nøkkeltall.</p>
      </div>
    );
  }

  const periods = sortPeriods([...new Set(metrics.map((m) => m.period))]);
  const latestPeriod = periods[periods.length - 1];
  const prevPeriod = periods.length >= 2 ? periods[periods.length - 2] : null;

  const getLatest = (name: string) =>
    metrics.find((m) => m.metricName === name && m.period === latestPeriod);
  const getPrev = (name: string) =>
    prevPeriod ? metrics.find((m) => m.metricName === name && m.period === prevPeriod) : null;

  const calcChange = (name: string) => {
    const latest = getLatest(name);
    const prev = getPrev(name);
    if (!latest || !prev || prev.value === 0) return undefined;
    return {
      value: ((latest.value - prev.value) / Math.abs(prev.value)) * 100,
      label: `fra ${prevPeriod}`,
    };
  };

  const formatValue = (name: string) => {
    const m = getLatest(name);
    if (!m) return "—";
    return m.unit === "%" ? `${m.value.toFixed(1)}%` : `${m.value.toLocaleString("nb-NO")} ${m.unit}`;
  };

  // Build chart data
  const revenueData = periods.map((p) => ({
    period: p,
    value: metrics.find((m) => m.metricName === "driftsinntekter" && m.period === p)?.value ?? 0,
  }));

  const marginsData = periods.map((p) => ({
    period: p,
    driftsmargin: metrics.find((m) => m.metricName === "driftsmargin" && m.period === p)?.value,
    ebitda_margin: metrics.find((m) => m.metricName === "ebitda_margin" && m.period === p)?.value,
    netto_margin: metrics.find((m) => m.metricName === "netto_margin" && m.period === p)?.value,
  }));

  const cashflowData = periods.map((p) => ({
    period: p,
    operasjonell: metrics.find((m) => m.metricName === "operasjonell_kontantstrom" && m.period === p)?.value,
    investering: metrics.find((m) => m.metricName === "investeringsaktiviteter" && m.period === p)?.value,
    fcf: metrics.find((m) => m.metricName === "fri_kontantstrom" && m.period === p)?.value,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Oversikt</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Driftsinntekter" value={formatValue("driftsinntekter")} change={calcChange("driftsinntekter")} color="green" />
        <KpiCard label="EBITDA" value={formatValue("ebitda")} change={calcChange("ebitda")} color="blue" />
        <KpiCard label="Fri kontantstrøm" value={formatValue("fri_kontantstrom")} change={calcChange("fri_kontantstrom")} color="yellow" />
        <KpiCard label="Driftsmargin" value={formatValue("driftsmargin")} change={calcChange("driftsmargin")} color="purple" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={revenueData} />
        <MarginsChart data={marginsData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashflowChart data={cashflowData} />
        <ComparisonTable metrics={metrics} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify in browser**

Navigate to a company with uploaded reports. KPI cards, charts, and comparison table should populate automatically.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/
git commit -m "feat: add overview tab with KPI cards, charts, and comparison table"
```

---

## Task 10: Chat API Route & Chat UI

**Files:**
- Create: `app/api/chat/route.ts`
- Create: `components/chat-interface.tsx`
- Modify: `components/dashboard/chat-tab.tsx`

- [ ] **Step 1: Create the streaming chat API route**

```ts
// app/api/chat/route.ts
import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { openai } from "@/lib/openai";
import { generateEmbedding } from "@/lib/embeddings";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const { message, companyId, sessionId } = await req.json();

  // 1. Generate embedding for the question
  const questionEmbedding = await generateEmbedding(message);

  // 2. Vector search for relevant chunks
  const relevantChunks = await convex.action(api.chunks.search, {
    companyId,
    embedding: questionEmbedding,
    limit: 8,
  });

  // 3. Build context from chunks
  const context = relevantChunks
    .map((chunk: any) => chunk.content)
    .join("\n\n---\n\n");

  // 4. Fetch conversation history for multi-turn context
  const existingMessages = await convex.query(api.chatMessages.listBySession, { sessionId });
  const conversationHistory = existingMessages.map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 5. Save user message to Convex
  await convex.mutation(api.chatMessages.create, {
    sessionId,
    role: "user",
    content: message,
  });

  // 6. Stream GPT-4o response (includes full conversation history)
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      {
        role: "system",
        content: `Du er en norsk finansanalytiker. Svar på spørsmål basert på følgende kontekst fra selskapets rapporter. Svar alltid på norsk. Vær presis og referer til spesifikke tall fra rapportene.

Kontekst:
${context}`,
      },
      ...conversationHistory,
      { role: "user", content: message },
    ],
  });

  // 6. Stream response back
  const encoder = new TextEncoder();
  let fullResponse = "";

  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      }

      // Save assistant message to Convex
      await convex.mutation(api.chatMessages.create, {
        sessionId,
        role: "assistant",
        content: fullResponse,
        sources: relevantChunks.slice(0, 3).map((c: any) => ({
          chunkId: c._id,
          content: c.content.substring(0, 200),
          pageRange: c.pageRange,
        })),
      });

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Create the chat interface component**

```tsx
// components/chat-interface.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function ChatInterface({
  companyId,
  sessionId,
}: {
  companyId: Id<"companies">;
  sessionId: Id<"chatSessions">;
}) {
  const messages = useQuery(api.chatMessages.listBySession, { sessionId });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput("");
    setIsLoading(true);
    setStreaming("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          companyId,
          sessionId,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            setStreaming((prev) => prev + parsed.content);
          } catch {}
        }
      }
    } finally {
      setStreaming("");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages?.map((msg) => (
          <div
            key={msg._id}
            className={`p-3 rounded-lg ${
              msg.role === "user"
                ? "bg-blue-50 ml-12"
                : "bg-gray-50 mr-12"
            }`}
          >
            <div className="text-xs text-gray-500 mb-1">
              {msg.role === "user" ? "Du" : "FinansAnalyse"}
            </div>
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 text-xs text-gray-400">
                Kilder: {msg.sources.map((s, i) => (
                  <span key={i}>
                    {s.pageRange ? `s. ${s.pageRange}` : `chunk`}
                    {i < msg.sources!.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Streaming message */}
        {streaming && (
          <div className="p-3 rounded-lg bg-gray-50 mr-12">
            <div className="text-xs text-gray-500 mb-1">FinansAnalyse</div>
            <div className="text-sm whitespace-pre-wrap">{streaming}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Still et spørsmål om selskapet..."
          className="flex-1 border rounded-md px-4 py-2 text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? "..." : "Spør"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Update the chat tab to create/manage sessions**

```tsx
// components/dashboard/chat-tab.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ChatInterface } from "../chat-interface";
import { useState } from "react";

export function ChatTab({ companyId }: { companyId: Id<"companies"> }) {
  const sessions = useQuery(api.chatSessions.listByCompany, { companyId });
  const createSession = useMutation(api.chatSessions.create);
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);

  const handleNewSession = async () => {
    const id = await createSession({ companyId, title: "Ny samtale" });
    setActiveSessionId(id);
  };

  // Auto-select first session or create one
  const activeSession = activeSessionId ?? sessions?.[0]?._id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Chat</h2>
        <button
          onClick={handleNewSession}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Ny samtale
        </button>
      </div>

      {sessions && sessions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sessions.map((s) => (
            <button
              key={s._id}
              onClick={() => setActiveSessionId(s._id)}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${
                (activeSession === s._id)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {s.title || "Samtale"}
            </button>
          ))}
        </div>
      )}

      {activeSession ? (
        <ChatInterface companyId={companyId} sessionId={activeSession} />
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">Ingen samtaler ennå</p>
          <button
            onClick={handleNewSession}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm"
          >
            Start en samtale
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Test the full flow: create company → upload PDF → wait for processing → check overview tab for charts → use chat tab to ask questions.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/ components/chat-interface.tsx components/dashboard/chat-tab.tsx
git commit -m "feat: add streaming RAG chat with session management"
```

---

## Task 11: Integration Testing & Polish

**Files:**
- Modify: `app/globals.css` (if needed for styling tweaks)
- Modify: various components for bug fixes found during testing

- [ ] **Step 1: End-to-end manual test**

Run through the full flow:
1. Start both servers: `npx convex dev` and `npm run dev`
2. Create a company (e.g., "Equinor ASA", ticker "EQNR")
3. Navigate to company → Dokumenter tab
4. Upload a real Norwegian annual or quarterly report PDF
5. Wait for processing to complete (status changes to "Klar")
6. Switch to Oversikt tab — verify KPIs, charts, and comparison table populate
7. Switch to Chat tab — ask "Hva var driftsinntektene?" and verify streaming response with sources

- [ ] **Step 2: Fix any issues found during testing**

Address bugs found in step 1. Common issues:
- opendataloader-pdf not finding Java — ensure `JAVA_HOME` is set
- Convex type mismatches — adjust schema if needed
- Chart rendering issues — check Recharts data format

- [ ] **Step 3: Add `.superpowers` to `.gitignore`**

```bash
echo ".superpowers/" >> .gitignore
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All unit tests pass.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: polish, bug fixes, and gitignore updates"
```

---

## Summary

| Task | What it builds | Depends on |
|------|---------------|------------|
| 1 | Project scaffolding (Next.js + deps) | — |
| 2 | Convex schema + base functions | 1 |
| 3 | Home page + company CRUD UI | 2 |
| 4 | PDF processor + chunker + period utils | 1 |
| 5 | OpenAI embeddings + financial extractor | 4 |
| 6 | Upload API route (full pipeline) | 2, 4, 5 |
| 7 | Batch upload UI component | 6 |
| 8 | Dashboard page + tabs + documents tab | 3, 7 |
| 9 | Overview tab (KPIs + charts) | 8 |
| 10 | Chat API + chat UI | 2, 5, 8 |
| 11 | Integration testing + polish | all |
