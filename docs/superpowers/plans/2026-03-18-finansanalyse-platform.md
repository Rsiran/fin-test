# FinansAnalyse Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Norwegian financial report analysis platform that converts PDFs to structured data, displays financial dashboards with charts, and provides RAG-powered chat.

**Architecture:** Next.js 15 (App Router) handles the UI and API routes. Convex provides the database, file storage, and vector search. opendataloader-pdf (Java) converts PDFs to Markdown. OpenAI GPT-4o powers financial data extraction and chat. Single deployment on Oracle Cloud Free Tier.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, Recharts, Convex, opendataloader-pdf, OpenAI API (GPT-4o + text-embedding-3-small)

**Design Language:** Bloomberg Terminal meets Scandinavian minimalism. Dark warm charcoal base, teal accent palette, JetBrains Mono for financial data, Geist for UI text, Phosphor Icons, borderless elevation cards. See `docs/superpowers/specs/2026-03-18-finansanalyse-frontend-prompt-design.md` for full spec.

**Spec:** `docs/superpowers/specs/2026-03-18-finance-rag-platform-design.md`

---

## File Structure

```
finance-test/
├── app/
│   ├── layout.tsx                          # Root layout with fonts, ConvexProvider, noise overlay
│   ├── convex-client-provider.tsx           # Convex client wrapper
│   ├── page.tsx                            # Home: company list + add company
│   ├── selskap/
│   │   └── [id]/
│   │       └── page.tsx                    # Company dashboard (tabs: Oversikt, Dokumenter, Chat)
│   ├── api/
│   │   ├── upload/
│   │   │   └── route.ts                    # PDF upload + processing pipeline
│   │   └── chat/
│   │       └── route.ts                    # Streaming RAG chat
│   └── globals.css                         # Tailwind imports, noise overlay, base dark styles
├── components/
│   ├── company-list.tsx                    # Company cards grid (elevation, dark theme)
│   ├── add-company-dialog.tsx              # Modal for adding company (dark)
│   ├── upload-dropzone.tsx                 # Batch drag-and-drop PDF upload
│   ├── chat-interface.tsx                  # Chat UI with streaming + sources
│   └── dashboard/
│       ├── tabs.tsx                        # Tab navigation with Phosphor icons on mobile
│       ├── overview-tab.tsx                # KPIs + charts layout
│       ├── documents-tab.tsx               # Document list + upload zone
│       ├── chat-tab.tsx                    # Chat wrapper for dashboard context
│       ├── kpi-card.tsx                    # Single KPI (JetBrains Mono values, teal accent)
│       ├── revenue-chart.tsx               # Bar/line chart (teal monochromatic)
│       ├── margins-chart.tsx               # Multi-line margins chart (teal spectrum)
│       ├── cashflow-chart.tsx              # Cash flow visualization (grouped bars)
│       └── comparison-table.tsx            # Metrics table (dark, no outer border)
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
├── tailwind.config.ts                      # Tailwind config with full design token set
├── tsconfig.json                           # TypeScript config
├── package.json                            # Dependencies
└── .env.local                              # CONVEX_URL, OPENAI_API_KEY
```

---

## Task 1: Project Scaffolding

**Files:**
- Recreate: `package.json`
- Create: `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/convex-client-provider.tsx`, `app/globals.css`, `app/page.tsx`, `postcss.config.mjs`

This task sets up Next.js 15 with Tailwind CSS, the full design token system, fonts, and all dependencies.

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/jonas/Desktop/Projects/finance-test
cp .env.local .env.local.bak
rm package.json
rm -rf node_modules convex
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --yes
cp .env.local.bak .env.local && rm .env.local.bak
```

Expected: Next.js project created with `app/` directory, `tailwind.config.ts`, `tsconfig.json`, etc.

- [ ] **Step 2: Install all dependencies**

```bash
cd /Users/jonas/Desktop/Projects/finance-test
npm install convex openai recharts @opendataloader/pdf @phosphor-icons/react
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

Note: `@phosphor-icons/react` is tree-shakeable — individual icon imports add ~1KB each.

- [ ] **Step 3: Configure Tailwind with design tokens**

Replace the generated `tailwind.config.ts` with the full design token set:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#1A1A1E",
        elevated: "#232323",
        accent: {
          DEFAULT: "#2DD4BF",
          light: "#5eead4",
          mid: "#14b8a6",
          muted: "#1a8a7d",
          subtle: "#134e48",
        },
        positive: "#4ade80",
        negative: "#f87171",
        warning: "#fbbf24",
        neutral: "#6b7280",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.4), 0 12px 28px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Configure fonts and root layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import { ConvexClientProvider } from "./convex-client-provider";
import "./globals.css";

const geist = localFont({
  src: "./fonts/GeistVF.woff2",
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="no" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-base text-[#F5F5F5] font-sans antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
        {/* Noise overlay for subtle analogue texture */}
        <div className="fixed inset-0 z-10 pointer-events-none noise-overlay" />
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
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

- [ ] **Step 5: Set up globals.css with dark theme base styles**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Noise overlay — subtle analogue texture */
.noise-overlay {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.03;
}

/* Subtle radial teal glow on page background */
body {
  background-image: radial-gradient(
    ellipse at 20% 0%,
    rgba(45, 212, 191, 0.03) 0%,
    transparent 60%
  );
  background-attachment: fixed;
}

/* Faint horizontal rules between major sections */
.section-divider {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

/* Skeleton shimmer for loading states */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #232323 25%,
    rgba(255, 255, 255, 0.04) 50%,
    #232323 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 10px;
}

/* Input focus glow */
input:focus, textarea:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.3);
}

/* Scrollbar styling for dark theme */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #1A1A1E;
}
::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}
```

- [ ] **Step 6: Add OPENAI_API_KEY to .env.local**

Append to existing `.env.local`:

```
OPENAI_API_KEY=sk-your-key-here
```

- [ ] **Step 7: Create placeholder home page**

```tsx
// app/page.tsx
export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold font-sans">FinansAnalyse</h1>
      <p className="mt-2 text-[#AAAAAA]">Analyser norske selskaper gjennom finansrapporter</p>
    </main>
  );
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Dark-themed page at http://localhost:3000 with Geist font, warm charcoal background, noise overlay visible.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 with dark theme, design tokens, fonts, and dependencies"
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
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
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
import { query, mutation, action } from "./_generated/server";
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
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-lg text-[#666666]">Ingen selskaper lagt til ennå</p>
        <p className="text-sm text-[#666666] mt-1">
          Legg til et selskap for å komme i gang
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {companies.map((company) => (
        <Link
          key={company._id}
          href={`/selskap/${company._id}`}
          className="block p-5 bg-elevated rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-150"
        >
          <h3 className="text-base font-semibold font-sans">{company.name}</h3>
          {company.ticker && (
            <span className="text-[11px] font-mono text-[#666666]">
              {company.ticker}
            </span>
          )}
          {company.description && (
            <p className="text-[13px] text-[#AAAAAA] mt-2 line-clamp-2">
              {company.description}
            </p>
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
import { X } from "@phosphor-icons/react";

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-elevated rounded-card shadow-card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Legg til selskap</h2>
          <button
            onClick={onClose}
            className="text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
              Selskapsnavn
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="f.eks. Equinor ASA"
              className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
              Ticker (valgfritt)
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="f.eks. EQNR"
              className="w-full bg-base rounded-lg px-3 py-2.5 text-sm font-mono shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#AAAAAA] border border-white/10 rounded-lg hover:text-[#F5F5F5] hover:border-white/20 transition-all duration-150"
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
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
import { Plus } from "@phosphor-icons/react";

export default function Home() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-sans">FinansAnalyse</h1>
          <p className="mt-1 text-sm text-[#AAAAAA]">
            Analyser norske selskaper gjennom finansrapporter
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
        >
          <Plus size={16} weight="bold" />
          Legg til selskap
        </button>
      </div>
      <CompanyList />
      <AddCompanyDialog open={showDialog} onClose={() => setShowDialog(false)} />
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Expected: Dark-themed home page with warm charcoal background, noise overlay, elevation cards for companies, teal primary button.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/company-list.tsx components/add-company-dialog.tsx
git commit -m "feat: add home page with company list and add company dialog (dark theme)"
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

  const qMatch = s.match(/q(\d)\s*(\d{4})/);
  if (qMatch) return `${qMatch[2]}-Q${qMatch[1]}`;

  const kvMatch = s.match(/(\S+)\s*kvartal\s*(\d{4})/);
  if (kvMatch) {
    const q = quarterWords[kvMatch[1]] ?? kvMatch[1];
    if (/^[1-4]$/.test(q)) return `${kvMatch[2]}-Q${q}`;
  }

  const hMatch = s.match(/h([12])\s*(\d{4})/);
  if (hMatch) return `${hMatch[2]}-H${hMatch[1]}`;

  const halvMatch = s.match(/halvårsrapport\s*(\d{4})/);
  if (halvMatch) return `${halvMatch[1]}-H1`;

  const fyMatch = s.match(/fy\s*(\d{4})/);
  if (fyMatch) return `${fyMatch[1]}-FY`;

  const arsMatch = s.match(/årsrapport\s*(\d{4})/);
  if (arsMatch) return `${arsMatch[1]}-FY`;

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
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

export function chunkMarkdown(markdown: string): Chunk[] {
  if (!markdown.trim()) return [];

  const sections = splitOnHeadings(markdown);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    if (section.length <= MAX_CHARS) {
      chunks.push({ content: section.trim(), chunkIndex: index++ });
    } else {
      const subChunks = splitLargeSection(section);
      for (const sub of subChunks) {
        chunks.push({ content: sub.trim(), chunkIndex: index++ });
      }
    }
  }

  return chunks;
}

function splitOnHeadings(markdown: string): string[] {
  const parts = markdown.split(/(?=^#{1,3}\s)/m);
  return parts.filter((p) => p.trim().length > 0);
}

function splitLargeSection(section: string): string[] {
  const paragraphs = section.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > MAX_CHARS && current.length > 0) {
      chunks.push(current);
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
import { readFile, writeFile, mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export async function convertPdfToMarkdown(pdfBuffer: Buffer): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "finansanalyse-"));
  const inputPath = join(tempDir, "input.pdf");
  const outputDir = join(tempDir, "output");

  try {
    await writeFile(inputPath, pdfBuffer);
    await mkdir(outputDir, { recursive: true });

    await execFileAsync("npx", [
      "@opendataloader/pdf",
      inputPath,
      "--output", outputDir,
      "--format", "markdown",
    ], {
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const { readdir } = await import("fs/promises");
    const files = await readdir(outputDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) throw new Error("No markdown output generated");

    return await readFile(join(outputDir, mdFile), "utf-8");
  } finally {
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

const NON_NEGATIVE_METRICS = [
  "driftsinntekter", "sum_eiendeler", "egenkapital",
];

export function validateMetrics(metrics: ExtractedMetric[]): ValidationResult {
  const valid: ExtractedMetric[] = [];
  const rejected: { metric: ExtractedMetric; reason: string }[] = [];

  for (const metric of metrics) {
    if (metric.unit === "%" && Math.abs(metric.value) > 100) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value}% exceeds ±100%` });
      continue;
    }

    if (NON_NEGATIVE_METRICS.includes(metric.metricName) && metric.value < 0) {
      rejected.push({ metric, reason: `${metric.metricName}: unexpected negative value ${metric.value}` });
      continue;
    }

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

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/ __tests__/
git commit -m "feat: add OpenAI embeddings, financial data extraction, and validation"
```

---

## Task 6: Upload API Route & Processing Pipeline

**Files:**
- Create: `app/api/upload/route.ts`

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
          reportType: "annet",
          period: "unknown",
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
          extractFinancialData(markdown),
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

```bash
npx convex dev    # Terminal 1
npm run dev       # Terminal 2

# Create a company via the UI, then:
curl -X POST http://localhost:3000/api/upload \
  -F "companyId=YOUR_COMPANY_ID" \
  -F "files=@sample-report.pdf"
```

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
import { CloudArrowUp, CheckCircle, XCircle, CircleNotch } from "@phosphor-icons/react";

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
      setResults(pdfFiles.map((f) => ({
        fileName: f.name,
        status: "error",
        error: "Opplasting feilet",
      })));
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
        className={`border border-dashed rounded-card p-8 text-center transition-all duration-150 ${
          isDragging
            ? "border-accent bg-accent-subtle/20"
            : "border-white/10 hover:border-white/20"
        }`}
      >
        <CloudArrowUp
          size={32}
          weight={isDragging ? "fill" : "light"}
          className={`mx-auto mb-3 ${isDragging ? "text-accent" : "text-[#666666]"}`}
        />
        <p className="text-sm text-[#AAAAAA]">
          {isUploading ? "Prosesserer..." : "Dra og slipp PDF-filer her"}
        </p>
        <p className="text-xs text-[#666666] mt-1">eller</p>
        <label className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg cursor-pointer hover:brightness-90 transition-all duration-150 font-medium">
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
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-card bg-elevated"
            >
              {r.status === "ready" ? (
                <CheckCircle size={18} weight="fill" className="text-positive" />
              ) : r.status === "error" ? (
                <XCircle size={18} weight="fill" className="text-negative" />
              ) : (
                <CircleNotch size={18} className="text-warning animate-spin" />
              )}
              <span className="text-sm font-sans">{r.fileName}</span>
              {r.error && (
                <span className="text-xs text-negative ml-auto">{r.error}</span>
              )}
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
git commit -m "feat: add batch drag-and-drop PDF upload component (dark theme)"
```

---

## Task 8: Company Dashboard — Tab Navigation & Documents Tab

**Files:**
- Create: `app/selskap/[id]/page.tsx`
- Create: `components/dashboard/tabs.tsx`
- Create: `components/dashboard/documents-tab.tsx`

- [ ] **Step 1: Create the dashboard page**

```tsx
// app/selskap/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { DashboardTabs } from "@/components/dashboard/tabs";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react";

export default function CompanyPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const company = useQuery(api.companies.get, { id: companyId });

  if (company === undefined) {
    return (
      <div className="min-h-screen p-8">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (company === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-negative">Selskap ikke funnet</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Top nav */}
      <div className="border-b border-white/5 px-8 py-4 flex items-center gap-3">
        <Link
          href="/"
          className="text-[#666666] hover:text-[#AAAAAA] transition-colors duration-150"
        >
          <CaretLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{company.name}</span>
          {company.ticker && (
            <span className="text-[11px] font-mono text-[#666666]">
              {company.ticker}
            </span>
          )}
        </div>
      </div>

      <DashboardTabs companyId={companyId} />
    </main>
  );
}
```

- [ ] **Step 2: Create tab navigation with Phosphor icons for mobile**

```tsx
// components/dashboard/tabs.tsx
"use client";

import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { DocumentsTab } from "./documents-tab";
import { OverviewTab } from "./overview-tab";
import { ChatTab } from "./chat-tab";
import { ChartBar, FileText, ChatCircle } from "@phosphor-icons/react";

const TABS = [
  { id: "oversikt", label: "Oversikt", icon: ChartBar },
  { id: "dokumenter", label: "Dokumenter", icon: FileText },
  { id: "chat", label: "Chat", icon: ChatCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DashboardTabs({ companyId }: { companyId: Id<"companies"> }) {
  const [activeTab, setActiveTab] = useState<TabId>("oversikt");

  return (
    <div>
      <div className="border-b border-white/5 flex">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors duration-150 flex items-center gap-2 ${
                isActive
                  ? "border-b-2 border-accent text-accent"
                  : "text-[#666666] hover:text-[#AAAAAA]"
              }`}
            >
              <Icon
                size={18}
                weight={isActive ? "fill" : "light"}
                className="sm:hidden"
              />
              <Icon
                size={16}
                weight={isActive ? "fill" : "light"}
                className="hidden sm:block"
              />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-8 max-w-7xl mx-auto">
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
import { Trash } from "@phosphor-icons/react";

export function DocumentsTab({ companyId }: { companyId: Id<"companies"> }) {
  const documents = useQuery(api.documents.listByCompany, { companyId });
  const removeDocument = useMutation(api.documents.remove);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Dokumenter</h2>

      <UploadDropzone companyId={companyId} />

      {documents === undefined ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-[#666666]">Ingen dokumenter lastet opp ennå</p>
      ) : (
        <div className="bg-elevated rounded-card shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Filnavn
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Type
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Periode
                </th>
                <th className="text-left py-3 px-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans">
                  Status
                </th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc._id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors duration-150"
                >
                  <td className="py-3 px-4 font-sans text-sm">{doc.fileName}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent-subtle text-accent font-mono">
                      {doc.reportType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-[#666666]">
                    {doc.period}
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          doc.status === "ready"
                            ? "bg-accent"
                            : doc.status === "error"
                            ? "bg-negative"
                            : "bg-warning"
                        }`}
                      />
                      <span className="text-xs text-[#AAAAAA]">
                        {doc.status === "ready"
                          ? "Klar"
                          : doc.status === "error"
                          ? "Feil"
                          : "Prosesserer..."}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => removeDocument({ id: doc._id })}
                      className="text-[#666666] hover:text-negative transition-colors duration-150"
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <div>
      <h2 className="text-lg font-semibold mb-4">Oversikt</h2>
      <p className="text-sm text-[#666666]">
        Last opp rapporter under Dokumenter-fanen for å se finansielle nøkkeltall.
      </p>
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
    <div>
      <h2 className="text-lg font-semibold mb-4">Chat</h2>
      <p className="text-sm text-[#666666]">Chat-funksjonalitet kommer i neste steg.</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Expected: Dark dashboard with teal tab underlines, Phosphor icons, status dots, elevation table, skeleton loading.

- [ ] **Step 6: Commit**

```bash
git add app/selskap/ components/dashboard/
git commit -m "feat: add company dashboard with tabs, documents tab (dark Bloomberg theme)"
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
}

export function KpiCard({ label, value, change }: KpiCardProps) {
  return (
    <div className="bg-elevated rounded-card shadow-card p-4 hover:shadow-card-hover transition-shadow duration-150">
      <div className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666]">
        {label}
      </div>
      <div className="text-xl font-mono font-medium text-accent mt-1.5">
        {value}
      </div>
      {change && (
        <div
          className={`text-[10px] font-mono mt-1.5 ${
            change.value >= 0 ? "text-positive" : "text-negative"
          }`}
        >
          {change.value >= 0 ? "▲" : "▼"} {Math.abs(change.value).toFixed(1)}%{" "}
          {change.label}
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

const GRID_STROKE = "rgba(255,255,255,0.06)";
const TOOLTIP_STYLE = {
  backgroundColor: "#232323",
  border: "none",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  color: "#F5F5F5",
  fontSize: "12px",
};

export function RevenueChart({ data }: RevenueChartProps) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666]">
          Driftsinntekter (MNOK)
        </h3>
        <div className="flex gap-1">
          {(["bar", "line"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`px-2.5 py-1 text-[11px] rounded transition-colors duration-150 ${
                chartType === type
                  ? "bg-accent/15 text-accent"
                  : "text-[#666666] hover:text-[#AAAAAA]"
              }`}
            >
              {type === "bar" ? "Søyle" : "Linje"}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" fill="#2DD4BF" radius={[2, 2, 0, 0]} animationDuration={300} animationEasing="ease-out" />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="value" stroke="#2DD4BF" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#2DD4BF" }} animationDuration={500} />
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

const GRID_STROKE = "rgba(255,255,255,0.06)";
const TOOLTIP_STYLE = {
  backgroundColor: "#232323",
  border: "none",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  color: "#F5F5F5",
  fontSize: "12px",
};

export function MarginsChart({ data }: MarginsChartProps) {
  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-4">
        Marginer (%)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} unit="%" axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "11px", color: "#AAAAAA" }}
          />
          <Line type="monotone" dataKey="driftsmargin" name="Driftsmargin" stroke="#5eead4" strokeWidth={2} dot={false} animationDuration={500} />
          <Line type="monotone" dataKey="ebitda_margin" name="EBITDA" stroke="#14b8a6" strokeWidth={1.5} dot={false} animationDuration={500} />
          <Line type="monotone" dataKey="netto_margin" name="Netto" stroke="#1a8a7d" strokeWidth={1.5} dot={false} animationDuration={500} />
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
    finansiering?: number;
    fcf?: number;
  }[];
}

const GRID_STROKE = "rgba(255,255,255,0.06)";
const TOOLTIP_STYLE = {
  backgroundColor: "#232323",
  border: "none",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  color: "#F5F5F5",
  fontSize: "12px",
};

export function CashflowChart({ data }: CashflowChartProps) {
  return (
    <div className="bg-elevated rounded-card shadow-card p-5">
      <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-4">
        Kontantstrøm (MNOK)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#666666", fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "11px", color: "#AAAAAA" }}
          />
          <Bar dataKey="operasjonell" name="Operasjonell" fill="#2DD4BF" radius={[2, 2, 0, 0]} animationDuration={300} />
          <Bar dataKey="investering" name="Investering" fill="#f87171" radius={[2, 2, 0, 0]} animationDuration={300} />
          <Bar dataKey="finansiering" name="Finansiering" fill="#6b7280" radius={[2, 2, 0, 0]} animationDuration={300} />
          <Bar dataKey="fcf" name="FCF" fill="#14b8a6" radius={[2, 2, 0, 0]} animationDuration={300} />
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
    <div className="bg-elevated rounded-card shadow-card p-5">
      <h3 className="text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-4">
        Nøkkeltall — Sammenligning
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-[9px] uppercase tracking-[1px] text-[#666666] font-sans font-normal">
                Nøkkeltall
              </th>
              {periods.map((p) => (
                <th
                  key={p}
                  className="text-right py-2 px-3 text-[9px] uppercase tracking-[1px] text-[#666666] font-mono font-normal"
                >
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISPLAY_METRICS.map((dm) => (
              <tr
                key={dm.key}
                className="border-t border-white/5 hover:bg-white/[0.03] transition-colors duration-150"
              >
                <td className="py-2.5 pr-4 font-sans text-sm text-[#AAAAAA]">
                  {dm.label}
                </td>
                {periods.map((p) => {
                  const val = getValue(dm.key, p);
                  return (
                    <td
                      key={p}
                      className={`text-right py-2.5 px-3 font-mono text-sm ${
                        p === latestPeriod ? "text-accent font-medium" : "text-[#F5F5F5]"
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

  if (metrics === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-64" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Oversikt</h2>
        <p className="text-sm text-[#666666]">
          Last opp rapporter under Dokumenter-fanen for å se finansielle nøkkeltall.
        </p>
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
    finansiering: metrics.find((m) => m.metricName === "finansieringsaktiviteter" && m.period === p)?.value,
    fcf: metrics.find((m) => m.metricName === "fri_kontantstrom" && m.period === p)?.value,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Driftsinntekter" value={formatValue("driftsinntekter")} change={calcChange("driftsinntekter")} />
        <KpiCard label="EBITDA" value={formatValue("ebitda")} change={calcChange("ebitda")} />
        <KpiCard label="Fri kontantstrøm" value={formatValue("fri_kontantstrom")} change={calcChange("fri_kontantstrom")} />
        <KpiCard label="Driftsmargin" value={formatValue("driftsmargin")} change={calcChange("driftsmargin")} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={revenueData} />
        <MarginsChart data={marginsData} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashflowChart data={cashflowData} />
        <ComparisonTable metrics={metrics} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify in browser**

Expected: Dark Bloomberg-style dashboard with teal KPI values, dark chart panels with teal monochromatic palette, elevation cards, JetBrains Mono for all numbers.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/
git commit -m "feat: add overview tab with KPIs, charts, comparison table (Bloomberg dark theme)"
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

  // 7. Stream response back
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
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PaperPlaneRight } from "@phosphor-icons/react";

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
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
        {messages?.map((msg) => (
          <div
            key={msg._id}
            className={`p-4 rounded-card max-w-[85%] ${
              msg.role === "user"
                ? "ml-auto bg-accent/10"
                : "mr-auto bg-elevated shadow-card"
            }`}
          >
            <div className="text-[9px] uppercase tracking-[1px] text-[#666666] mb-1.5 font-sans">
              {msg.role === "user" ? "Du" : "FinansAnalyse"}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {msg.content}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {msg.sources.map((s, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-subtle text-accent cursor-pointer hover:bg-accent-muted transition-colors duration-150"
                  >
                    {s.pageRange ? `s. ${s.pageRange}` : `kilde ${i + 1}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Streaming message */}
        {streaming && (
          <div className="p-4 rounded-card bg-elevated shadow-card mr-auto max-w-[85%]">
            <div className="text-[9px] uppercase tracking-[1px] text-[#666666] mb-1.5 font-sans">
              FinansAnalyse
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {streaming}
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" />
            </div>
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
          className="flex-1 bg-base rounded-lg px-4 py-3 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-3 bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Update the chat tab**

```tsx
// components/dashboard/chat-tab.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ChatInterface } from "../chat-interface";
import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

export function ChatTab({ companyId }: { companyId: Id<"companies"> }) {
  const sessions = useQuery(api.chatSessions.listByCompany, { companyId });
  const createSession = useMutation(api.chatSessions.create);
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);

  const handleNewSession = async () => {
    const id = await createSession({ companyId, title: "Ny samtale" });
    setActiveSessionId(id);
  };

  const activeSession = activeSessionId ?? sessions?.[0]?._id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chat</h2>
        <button
          onClick={handleNewSession}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
        >
          <Plus size={14} weight="bold" />
          Ny samtale
        </button>
      </div>

      {sessions && sessions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sessions.map((s) => (
            <button
              key={s._id}
              onClick={() => setActiveSessionId(s._id)}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors duration-150 ${
                activeSession === s._id
                  ? "bg-accent/15 text-accent"
                  : "bg-elevated text-[#666666] hover:text-[#AAAAAA]"
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
        <div className="text-center py-16">
          <p className="text-[#666666]">Ingen samtaler ennå</p>
          <button
            onClick={handleNewSession}
            className="mt-3 px-4 py-2 bg-accent text-base rounded-lg text-sm font-medium hover:brightness-90 transition-all duration-150"
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

Expected: Dark chat with teal-tinted user messages (right-aligned), elevated AI messages (left-aligned), teal source citation pills, pulsing cursor during streaming, inset-shadow input.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/ components/chat-interface.tsx components/dashboard/chat-tab.tsx
git commit -m "feat: add streaming RAG chat with dark theme and source citations"
```

---

## Task 11: Integration Testing & Polish

**Files:**
- Modify: various components for bug fixes found during testing

- [ ] **Step 1: End-to-end manual test**

1. Start both servers: `npx convex dev` and `npm run dev`
2. Create a company (e.g., "Equinor ASA", ticker "EQNR")
3. Navigate to company → Dokumenter tab
4. Upload a real Norwegian annual or quarterly report PDF
5. Wait for processing to complete (status dot turns teal)
6. Switch to Oversikt tab — verify KPI cards (teal values), charts (teal palette), and comparison table
7. Switch to Chat tab — ask "Hva var driftsinntektene?" and verify streaming response with source pills

- [ ] **Step 2: Fix any issues found during testing**

Common issues:
- opendataloader-pdf not finding Java — ensure `JAVA_HOME` is set
- Convex type mismatches — adjust schema if needed
- Recharts SSR issues — ensure all chart components have `"use client"`
- Font loading — verify Geist woff2 file exists in `app/fonts/`

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
| 1 | Project scaffolding (Next.js + dark theme + design tokens + fonts) | — |
| 2 | Convex schema + base functions | 1 |
| 3 | Home page + company CRUD UI (dark, elevation cards) | 2 |
| 4 | PDF processor + chunker + period utils | 1 |
| 5 | OpenAI embeddings + financial extractor | 4 |
| 6 | Upload API route (full pipeline) | 2, 4, 5 |
| 7 | Batch upload UI (dark dropzone, Phosphor icons) | 6 |
| 8 | Dashboard page + tabs + documents tab (Bloomberg dark) | 3, 7 |
| 9 | Overview tab (teal KPIs + monochromatic charts) | 8 |
| 10 | Chat API + chat UI (dark, streaming, source pills) | 2, 5, 8 |
| 11 | Integration testing + polish | all |
