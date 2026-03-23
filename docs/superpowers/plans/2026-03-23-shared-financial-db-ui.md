# Shared Financial Database UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-user support with personal dashboards, shared company/report database, private chats, and ownership-based report deletion.

**Architecture:** Convex built-in auth (set up separately) provides `ctx.auth.getUserIdentity()`. We add a `userCompanies` junction table for bookmarks, `uploadedBy` on documents, `userId` on chatSessions, and auth guards on all mutations/queries. Frontend gets dashboard + browse pages.

**Tech Stack:** Next.js 15 (App Router), Convex 1.33, React 19, Tailwind CSS, Phosphor Icons

**Spec:** `docs/superpowers/specs/2026-03-23-shared-financial-db-ui-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `convex/lib/auth.ts` | Shared `requireAuth(ctx)` helper |
| Modify | `convex/schema.ts` | Add `userCompanies` table, `uploadedBy` on documents, `userId` on chatSessions |
| Create | `convex/userCompanies.ts` | Bookmark CRUD: add, remove, list, isBookmarked |
| Modify | `convex/companies.ts` | Add `search()` query, auto-bookmark on create, cascade `userCompanies` in removeWithData |
| Modify | `convex/documents.ts` | Add `uploadedBy`, ownership check on delete, storage cleanup, auth guards |
| Modify | `convex/chatSessions.ts` | Add `userId`, filter by user, auth guards |
| Modify | `convex/chatMessages.ts` | Auth guards, verify session ownership |
| Modify | `app/page.tsx` | Replace with auth redirect |
| Create | `app/dashboard/page.tsx` | Dashboard page |
| Create | `app/browse/page.tsx` | Browse page |
| Create | `app/login/page.tsx` | Login page shell |
| Modify | `app/selskap/[id]/page.tsx` | Remove delete button, update back-link |
| Create | `components/auth-guard.tsx` | Auth state check + redirect |
| Create | `components/dashboard/dashboard-empty.tsx` | Empty state with CTA |
| Create | `components/dashboard/company-dashboard-card.tsx` | Dashboard card with unbookmark |
| Create | `components/browse/search-bar.tsx` | Debounced search input |
| Create | `components/browse/company-browse-card.tsx` | Browse card with bookmark toggle |
| Create | `convex/users.ts` | Current user identity query (`me`) |
| Delete | `components/company-list.tsx` | No longer used — replaced by dashboard page |
| Modify | `components/dashboard/documents-tab.tsx` | Ownership-based delete, "Slett mine dokumenter" |
| Modify | `components/dashboard/chat-tab.tsx` | No code changes needed (backend filters) |
| Modify | `app/selskap/[id]/page.tsx` | Wrap in AuthGuard |

---

### Task 1: Auth Helper

**Files:**
- Create: `convex/lib/auth.ts`

- [ ] **Step 1: Create the auth helper**

```typescript
// convex/lib/auth.ts
import { QueryCtx, MutationCtx } from "../_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/lib/auth.ts
git commit -m "feat: add requireAuth helper for Convex functions"
```

---

### Task 2: Schema Changes

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add `userCompanies` table and modify `documents` + `chatSessions`**

Add to `convex/schema.ts` after the `companies` table definition:

```typescript
userCompanies: defineTable({
  userId: v.string(),
  companyId: v.id("companies"),
  addedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_company", ["companyId"])
  .index("by_user_company", ["userId", "companyId"]),
```

Add `uploadedBy: v.optional(v.string()),` to the `documents` table definition, after `createdAt`.

Add `userId: v.optional(v.string()),` to the `chatSessions` table definition, after `companyId`.

Change the `chatSessions` index from:
```typescript
.index("by_company", ["companyId"]),
```
to:
```typescript
.index("by_company", ["companyId"])
.index("by_user_company", ["userId", "companyId"]),
```

Keep `by_company` — it's still used by `removeWithData` cascade.

- [ ] **Step 2: Verify schema deploys**

Run: `npx convex dev --once` (or check that the dev server picks up changes without errors)

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add userCompanies table, uploadedBy and userId fields"
```

---

### Task 3: `convex/userCompanies.ts` — Bookmark CRUD

**Files:**
- Create: `convex/userCompanies.ts`

- [ ] **Step 1: Create the file with all functions**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

export const addCompany = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    // Idempotent — check if already bookmarked
    const existing = await ctx.db
      .query("userCompanies")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("userCompanies", {
      userId,
      companyId: args.companyId,
      addedAt: Date.now(),
    });
  },
});

export const removeCompany = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const bookmark = await ctx.db
      .query("userCompanies")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .first();
    if (bookmark) {
      await ctx.db.delete(bookmark._id);
    }
  },
});

export const listMyCompanies = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const bookmarks = await ctx.db
      .query("userCompanies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const companies = await Promise.all(
      bookmarks.map(async (b) => {
        const company = await ctx.db.get(b.companyId);
        return company ? { ...company, bookmarkId: b._id, addedAt: b.addedAt } : null;
      })
    );
    return companies.filter(Boolean);
  },
});

export const isBookmarked = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const existing = await ctx.db
      .query("userCompanies")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .first();
    return !!existing;
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/userCompanies.ts
git commit -m "feat: add userCompanies bookmark CRUD functions"
```

---

### Task 4: Modify `convex/companies.ts` — Search + Cascade

**Files:**
- Modify: `convex/companies.ts:1-91`

- [ ] **Step 1: Add `requireAuth` import**

Add at top of file:
```typescript
import { requireAuth } from "./lib/auth";
```

- [ ] **Step 2: Add auth to existing `get`, `list`, `remove`, and `removeWithData`**

Add `await requireAuth(ctx);` as the first line in each handler for `get`, `list`, `remove`, and `removeWithData`.

- [ ] **Step 3: Add `search` query**

Add after the existing `get` query:

```typescript
export const search = query({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let companies = await ctx.db.query("companies").collect();

    // Filter by name/ticker if query provided
    if (args.query) {
      const q = args.query.toLowerCase();
      companies = companies.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.ticker && c.ticker.toLowerCase().includes(q))
      );
    }

    // Aggregate stats per company
    const results = await Promise.all(
      companies.map(async (company) => {
        const docs = await ctx.db
          .query("documents")
          .withIndex("by_company", (q) => q.eq("companyId", company._id))
          .collect();
        const reportCount = docs.length;
        const lastReportDate = docs.length > 0
          ? Math.max(...docs.map((d) => d.createdAt))
          : null;
        return { ...company, reportCount, lastReportDate };
      })
    );

    return results;
  },
});
```

- [ ] **Step 4: Add auth to `create` and auto-bookmark**

Replace the `create` mutation handler:

```typescript
export const create = mutation({
  args: {
    name: v.string(),
    ticker: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const companyId = await ctx.db.insert("companies", {
      ...args,
      createdAt: Date.now(),
    });
    // Auto-bookmark for the creating user
    await ctx.db.insert("userCompanies", {
      userId,
      companyId,
      addedAt: Date.now(),
    });
    return companyId;
  },
});
```

- [ ] **Step 5: Add `userCompanies` cascade to `removeWithData`**

In the `removeWithData` handler, add this block before `// Delete the company itself`:

```typescript
// Delete userCompanies bookmarks
const bookmarks = await ctx.db
  .query("userCompanies")
  .withIndex("by_company", (q) => q.eq("companyId", args.id))
  .collect();
for (const bookmark of bookmarks) {
  await ctx.db.delete(bookmark._id);
}
```

- [ ] **Step 6: Commit**

```bash
git add convex/companies.ts
git commit -m "feat: add search query, auto-bookmark on create, cascade userCompanies, auth guards"
```

---

### Task 5: Modify `convex/documents.ts` — Auth + Ownership

**Files:**
- Modify: `convex/documents.ts:1-76`

- [ ] **Step 1: Add `requireAuth` import**

```typescript
import { requireAuth } from "./lib/auth";
```

- [ ] **Step 2: Add auth to `listByCompany`**

Add to the start of the handler:
```typescript
await requireAuth(ctx);
```

- [ ] **Step 3: Add `uploadedBy` to `create`**

Replace the `create` handler:

```typescript
export const create = mutation({
  args: {
    companyId: v.id("companies"),
    fileName: v.string(),
    fileId: v.id("_storage"),
    reportType: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    return await ctx.db.insert("documents", {
      ...args,
      uploadedBy: userId,
      status: "processing",
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Add ownership check + storage cleanup to `remove`**

Replace the `remove` mutation:

```typescript
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Document not found");
    // Ownership check: only uploader can delete
    if (doc.uploadedBy && doc.uploadedBy !== userId) {
      throw new Error("You can only delete documents you uploaded");
    }
    if (!doc.uploadedBy) {
      throw new Error("Cannot delete legacy documents without an owner");
    }

    // Delete chunks
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
    // Delete metrics
    const metrics = await ctx.db
      .query("financialMetrics")
      .withIndex("by_company", (q) => q.eq("companyId", doc.companyId))
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .collect();
    for (const metric of metrics) {
      await ctx.db.delete(metric._id);
    }
    // Delete storage files
    await ctx.storage.delete(doc.fileId);
    if (doc.markdownFileId) {
      await ctx.storage.delete(doc.markdownFileId);
    }
    // Delete document record
    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 5: Add auth to `updateStatus`**

Add `await requireAuth(ctx);` as the first line in the `updateStatus` handler.

Note: If the upload processing pipeline calls `updateStatus` from an internal Convex action (not client-facing), this guard may need to be removed. Verify during integration testing.

- [ ] **Step 6: Add auth to `generateUploadUrl`**

```typescript
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
```

- [ ] **Step 7: Commit**

```bash
git add convex/documents.ts
git commit -m "feat: add uploadedBy, ownership-based delete, storage cleanup, auth guards"
```

---

### Task 6: Modify `convex/chatSessions.ts` — User Scoping

**Files:**
- Modify: `convex/chatSessions.ts:1-22`

- [ ] **Step 1: Replace entire file**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

export const listByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_user_company", (q) =>
        q.eq("userId", userId).eq("companyId", args.companyId)
      )
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: { companyId: v.id("companies"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    return await ctx.db.insert("chatSessions", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/chatSessions.ts
git commit -m "feat: scope chat sessions to authenticated user"
```

---

### Task 7: Modify `convex/chatMessages.ts` — Auth Guards

**Files:**
- Modify: `convex/chatMessages.ts:1-30`

- [ ] **Step 1: Replace entire file**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";

export const listBySession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    // Verify session belongs to this user
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("Session not found");
    }
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
    const userId = await requireAuth(ctx);
    // Verify session belongs to this user
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("Session not found");
    }
    return await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/chatMessages.ts
git commit -m "feat: add auth guards and session ownership check to chatMessages"
```

---

### Task 8: Auth Guard Component

**Files:**
- Create: `components/auth-guard.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="skeleton h-8 w-48" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/auth-guard.tsx
git commit -m "feat: add AuthGuard component for protected routes"
```

---

### Task 9: Root Redirect + Login Page Shell

**Files:**
- Modify: `app/page.tsx`
- Create: `app/login/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx` with redirect**

```tsx
"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="skeleton h-8 w-48" />
    </div>
  );
}
```

- [ ] **Step 2: Create login page shell**

```tsx
// app/login/page.tsx
"use client";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-sm w-full space-y-6 text-center">
        <h1 className="text-2xl font-bold font-sans">FinansAnalyse</h1>
        <p className="text-sm text-[#AAAAAA]">
          Logg inn for å analysere finansrapporter
        </p>
        {/* Auth provider UI will be mounted here by the auth infra team */}
        <div className="p-8 bg-elevated rounded-card shadow-card">
          <p className="text-sm text-[#666666]">
            Innlogging konfigureres separat
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/login/page.tsx
git commit -m "feat: add auth redirect on root and login page shell"
```

---

### Task 10: Dashboard Page

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/dashboard/dashboard-empty.tsx`
- Create: `components/dashboard/company-dashboard-card.tsx`

- [ ] **Step 1: Create empty state component**

```tsx
// components/dashboard/dashboard-empty.tsx
"use client";

import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react";

export function DashboardEmpty() {
  return (
    <div className="text-center py-20">
      <p className="text-lg text-[#666666]">Ingen selskaper lagt til ennå</p>
      <p className="text-sm text-[#666666] mt-1">
        Utforsk databasen for å legge til selskaper
      </p>
      <Link
        href="/browse"
        className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-accent text-base rounded-lg text-sm font-medium hover:brightness-90 transition-all duration-150"
      >
        <MagnifyingGlass size={16} weight="bold" />
        Utforsk selskaper
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Create dashboard card component**

```tsx
// components/dashboard/company-dashboard-card.tsx
"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { X } from "@phosphor-icons/react";

interface CompanyDashboardCardProps {
  id: Id<"companies">;
  name: string;
  ticker?: string;
  description?: string;
}

export function CompanyDashboardCard({ id, name, ticker, description }: CompanyDashboardCardProps) {
  const removeCompany = useMutation(api.userCompanies.removeCompany);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await removeCompany({ companyId: id });
  };

  return (
    <Link
      href={`/selskap/${id}`}
      className="group relative block p-5 bg-elevated rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-150"
    >
      <button
        onClick={handleRemove}
        className="absolute top-3 right-3 text-[#666666] hover:text-negative transition-colors duration-150 opacity-0 group-hover:opacity-100"
        title="Fjern fra oversikt"
      >
        <X size={14} />
      </button>
      <h3 className="text-base font-semibold font-sans !text-white">{name}</h3>
      {ticker && (
        <span className="text-[11px] font-mono !text-[#AAAAAA]">{ticker}</span>
      )}
      {description && (
        <p className="text-[13px] text-[#AAAAAA] mt-2 line-clamp-2">{description}</p>
      )}
    </Link>
  );
}
```

- [ ] **Step 3: Create dashboard page**

```tsx
// app/dashboard/page.tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { CompanyDashboardCard } from "@/components/dashboard/company-dashboard-card";
import { AddCompanyDialog } from "@/components/add-company-dialog";
import { Plus } from "@phosphor-icons/react";
import Link from "next/link";

function DashboardContent() {
  const companies = useQuery(api.userCompanies.listMyCompanies);
  const [showDialog, setShowDialog] = useState(false);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-sans">FinansAnalyse</h1>
          <p className="mt-1 text-sm text-[#AAAAAA]">
            Dine selskaper
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/browse"
            className="px-4 py-2 text-sm text-[#AAAAAA] border border-white/10 rounded-lg hover:text-[#F5F5F5] transition-all duration-150 font-medium"
          >
            Utforsk
          </Link>
          <button
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
          >
            <Plus size={16} weight="bold" />
            Nytt selskap
          </button>
        </div>
      </div>

      {companies === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <DashboardEmpty />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyDashboardCard
              key={company._id}
              id={company._id}
              name={company.name}
              ticker={company.ticker}
              description={company.description}
            />
          ))}
        </div>
      )}

      <AddCompanyDialog open={showDialog} onClose={() => setShowDialog(false)} />
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx components/dashboard/dashboard-empty.tsx components/dashboard/company-dashboard-card.tsx
git commit -m "feat: add dashboard page with bookmarked companies grid"
```

---

### Task 11: Browse Page

**Files:**
- Create: `app/browse/page.tsx`
- Create: `components/browse/search-bar.tsx`
- Create: `components/browse/company-browse-card.tsx`

- [ ] **Step 1: Create search bar**

```tsx
// components/browse/search-bar.tsx
"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = "Søk etter selskap..." }: SearchBarProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => onSearch(value), 300);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className="relative">
      <MagnifyingGlass
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 bg-elevated border border-white/10 rounded-lg text-sm text-[#F5F5F5] placeholder:text-[#666666] focus:outline-none focus:border-accent/50 transition-colors duration-150"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create browse card**

```tsx
// components/browse/company-browse-card.tsx
"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Star } from "@phosphor-icons/react";

interface CompanyBrowseCardProps {
  id: Id<"companies">;
  name: string;
  ticker?: string;
  reportCount: number;
  lastReportDate: number | null;
  isBookmarked: boolean;
}

export function CompanyBrowseCard({
  id,
  name,
  ticker,
  reportCount,
  lastReportDate,
  isBookmarked,
}: CompanyBrowseCardProps) {
  const addCompany = useMutation(api.userCompanies.addCompany);
  const removeCompany = useMutation(api.userCompanies.removeCompany);

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBookmarked) {
      await removeCompany({ companyId: id });
    } else {
      await addCompany({ companyId: id });
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Link
      href={`/selskap/${id}`}
      className="group relative block p-5 bg-elevated rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-150"
    >
      <button
        onClick={handleToggleBookmark}
        className="absolute top-3 right-3 transition-colors duration-150"
        title={isBookmarked ? "Fjern fra oversikt" : "Legg til i oversikt"}
      >
        {isBookmarked ? (
          <Star size={16} weight="fill" className="text-accent" />
        ) : (
          <Star size={16} className="text-[#666666] hover:text-accent" />
        )}
      </button>
      <h3 className="text-base font-semibold font-sans !text-white">{name}</h3>
      {ticker && (
        <span className="text-[11px] font-mono !text-[#AAAAAA]">{ticker}</span>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-[#666666]">
        <span>{reportCount} {reportCount === 1 ? "rapport" : "rapporter"}</span>
        {lastReportDate && (
          <>
            <span className="text-white/10">|</span>
            <span>Sist oppdatert {formatDate(lastReportDate)}</span>
          </>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Create browse page**

```tsx
// app/browse/page.tsx
"use client";

import { useCallback, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthGuard } from "@/components/auth-guard";
import { SearchBar } from "@/components/browse/search-bar";
import { CompanyBrowseCard } from "@/components/browse/company-browse-card";
import { CaretLeft } from "@phosphor-icons/react";
import Link from "next/link";

function BrowseContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const companies = useQuery(api.companies.search, {
    query: searchQuery || undefined,
  });
  const myCompanies = useQuery(api.userCompanies.listMyCompanies);

  const bookmarkedIds = new Set(myCompanies?.map((c) => c._id) ?? []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="text-[#666666] hover:text-[#AAAAAA] transition-colors duration-150"
        >
          <CaretLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-sans">Utforsk selskaper</h1>
          <p className="mt-1 text-sm text-[#AAAAAA]">
            Søk i databasen og legg til selskaper i din oversikt
          </p>
        </div>
      </div>

      <div className="mb-6">
        <SearchBar onSearch={handleSearch} />
      </div>

      {companies === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg text-[#666666]">
            {searchQuery ? "Ingen selskaper funnet" : "Ingen selskaper i databasen ennå"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyBrowseCard
              key={company._id}
              id={company._id}
              name={company.name}
              ticker={company.ticker}
              reportCount={company.reportCount}
              lastReportDate={company.lastReportDate}
              isBookmarked={bookmarkedIds.has(company._id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export default function BrowsePage() {
  return (
    <AuthGuard>
      <BrowseContent />
    </AuthGuard>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/browse/page.tsx components/browse/search-bar.tsx components/browse/company-browse-card.tsx
git commit -m "feat: add browse page with search and bookmark toggle"
```

---

### Task 12: Modify Company Detail Page

**Files:**
- Modify: `app/selskap/[id]/page.tsx`

- [ ] **Step 1: Update back-link from `/` to `/dashboard`**

In `app/selskap/[id]/page.tsx`, change:
```tsx
href="/"
```
to:
```tsx
href="/dashboard"
```

- [ ] **Step 2: Remove delete company button and confirmation modal**

Remove the delete button, `showDeleteConfirm` state, `isDeleting` state, `handleDelete` function, `removeCompany` mutation, and the confirmation modal JSX. The `removeWithData` import and usage should be removed entirely.

Keep: `useQuery(api.companies.get, ...)`, the loading/not-found states, the header with back-link + company name/ticker, and the `DashboardTabs` component.

- [ ] **Step 3: Wrap page in AuthGuard**

Import `AuthGuard` from `@/components/auth-guard` and wrap the page content:

```tsx
import { AuthGuard } from "@/components/auth-guard";

export default function CompanyPage() {
  return (
    <AuthGuard>
      <CompanyPageContent />
    </AuthGuard>
  );
}
```

Extract the existing page body into a `CompanyPageContent` component within the same file.

- [ ] **Step 4: Delete `components/company-list.tsx`**

This component is no longer used — `app/page.tsx` was the only consumer and is now a redirect. The dashboard page uses `CompanyDashboardCard` instead.

```bash
git rm components/company-list.tsx
```

- [ ] **Step 5: Commit**

```bash
git add app/selskap/[id]/page.tsx
git commit -m "feat: update company detail — remove delete button, AuthGuard, link to dashboard, remove unused company-list"
```

---

### Task 13: Modify Documents Tab — Ownership UI

**Files:**
- Modify: `components/dashboard/documents-tab.tsx`

- [ ] **Step 1: Get current user identity for ownership comparison**

Add to imports:
```tsx
import { useConvexAuth } from "convex/react";
```

Inside the component, add a hook to get current user's identity. Since we need the `subject` (userId), use the Convex `useQuery` with a small helper, or use `useConvexAuth` for auth state and pass userId from a parent.

The simplest approach: create a small hook or query. For now, add a Convex query `convex/lib/auth.ts` won't work client-side. Instead, use `useQuery` with a tiny Convex query:

Add to `convex/documents.ts` a query that returns the current user's ID:

```typescript
export const currentUserId = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuth(ctx);
  },
});
```

Actually, better: add this to a new `convex/users.ts`:

```typescript
// convex/users.ts
import { query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuth(ctx);
  },
});
```

- [ ] **Step 2: Update documents tab**

Replace "Slett alle dokumenter" button with "Slett mine dokumenter". Add ownership check per row for delete button. Show uploader indicator.

Key changes to `documents-tab.tsx`:

1. Import and use `api.users.me` to get `currentUserId`
2. Replace `handleDeleteAll` to only delete own documents:
```tsx
const currentUserId = useQuery(api.users.me);

const myDocuments = documents?.filter((d) => d.uploadedBy === currentUserId);

const handleDeleteMine = async () => {
  if (!myDocuments) return;
  for (const doc of myDocuments) {
    await removeDocument({ id: doc._id });
  }
  setShowDeleteAll(false);
};
```

3. Change button text from "Slett alle dokumenter" to "Slett mine dokumenter"
4. Change confirmation text accordingly
5. In the table rows, only show the trash button if `doc.uploadedBy === currentUserId`:
```tsx
<td className="py-3 px-4 text-right">
  {doc.uploadedBy === currentUserId && (
    <button
      onClick={() => removeDocument({ id: doc._id })}
      className="text-[#666666] hover:text-negative transition-colors duration-150"
    >
      <Trash size={16} />
    </button>
  )}
</td>
```

- [ ] **Step 3: Commit**

```bash
git add convex/users.ts components/dashboard/documents-tab.tsx
git commit -m "feat: ownership-based document deletion UI"
```

---

### Task 14: Verify & Test End-to-End

- [ ] **Step 1: Run `npx convex dev --once` to verify schema + functions deploy**

Expected: no errors

- [ ] **Step 2: Run `npm run build` to verify Next.js compiles**

Expected: no TypeScript or build errors

- [ ] **Step 3: Manual smoke test checklist**

1. Visit `/` → should redirect to `/login` (or `/dashboard` if authed)
2. After auth, `/dashboard` shows empty state with link to browse
3. `/browse` shows all companies with search
4. Bookmark a company → appears on dashboard
5. Unbookmark → disappears from dashboard
6. Create new company → auto-appears on dashboard
7. Upload a report → visible to all users on that company
8. Delete own report → works. Other user's report → no delete button.
9. "Slett mine dokumenter" only deletes own uploads
10. Chat → sessions are private per user
11. Back-link on company detail goes to `/dashboard`

- [ ] **Step 4: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix: smoke test corrections"
```
