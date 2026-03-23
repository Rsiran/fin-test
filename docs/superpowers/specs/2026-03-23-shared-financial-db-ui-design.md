# Shared Financial Database UI Design

**Date:** 2026-03-23
**Status:** Approved

## Context

FinansAnalyse is a Next.js 15 + Convex financial analysis app. Auth infrastructure (Convex built-in auth) is being implemented separately. This spec covers the UI and backend changes needed to support multi-user access to a shared company/report database with private chats and personal dashboards.

## Core Concepts

- **Shared database:** All companies and reports are global. Any user's upload is visible to all users viewing that company.
- **Personal dashboard:** Each user bookmarks companies they want on their home screen. No "projects" entity — just a `userCompanies` junction table.
- **Private chats:** Chat sessions are scoped to the authenticated user. Two users viewing the same company have independent chat histories.
- **Ownership-based deletion:** Any user can upload reports. Only the uploader can delete their own reports. Company deletion is admin-only (not in UI scope).

## Schema Changes

### New Table: `userCompanies`

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | From `ctx.auth.getUserIdentity().subject` |
| `companyId` | Id\<"companies"\> | Reference to companies table |
| `addedAt` | number | Timestamp |

**Indexes:** `by_user` on `userId`, `by_company` on `companyId`, `by_user_company` on `[userId, companyId]`

### Modified Table: `documents`

| New Field | Type | Description |
|-----------|------|-------------|
| `uploadedBy` | optional string | userId of uploader, enables ownership-based delete. Optional to accommodate pre-existing rows (no `uploadedBy` → treated as unowned, no user can delete). |

### Modified Table: `chatSessions`

| New Field | Type | Description |
|-----------|------|-------------|
| `userId` | optional string | Scopes sessions to authenticated user. Optional for pre-existing rows (no `userId` → orphaned, not shown to any user). |

**Index change:** `by_company` → `by_user_company` on `[userId, companyId]`

### Unchanged Tables

- `companies` — no changes
- `chatMessages` — already scoped via sessionId
- `chunks` — no changes
- `financialMetrics` — no changes

## Pages & Routing

```
/                         → Redirect: /dashboard (authed) or /login (not authed)
/login                    → Login page (UI shell, auth infra handled elsewhere)
/dashboard                → User's bookmarked companies
/browse                   → Search/browse all shared companies
/selskap/[id]             → Company detail (existing, modified)
```

### Dashboard (`/dashboard`)

- Grid of bookmarked company cards (same visual style as current home)
- Each card: company name, ticker, quick "remove from dashboard" action
- "Add Company" button — creates in shared DB + auto-bookmarks
- **Empty state:** "No companies yet — browse the database to get started" with link to `/browse`

### Browse (`/browse`)

- Search bar with debounced filtering by company name and ticker
- Grid of all companies in the database
- Each card shows: name, ticker, report count, last report date
- Cards already bookmarked show a visual indicator (filled star)
- "Add to dashboard" button on each card
- Clicking card navigates to `/selskap/[id]`

### Company Detail (`/selskap/[id]`)

- Remove delete company button (admin-only, out of scope)
- **Documents tab:** show uploader info per document, delete button only on own uploads
- **Chat tab:** only shows sessions belonging to current user (filtered by backend)

## Convex Backend

### New: `convex/userCompanies.ts`

- `addCompany(companyId)` — idempotent bookmark
- `removeCompany(companyId)` — unbookmark
- `listMyCompanies()` — returns bookmarked companies with joined company data
- `isBookmarked(companyId)` — single check
- All functions require auth, throw if not authenticated

### Modified: `convex/companies.ts`

- `search({ query? })` → returns all companies with optional name/ticker filter + aggregate stats (report count, latest report date). Replaces `list()` for the browse page. Keep `list()` as-is for internal use (e.g., joins).
- `create()` → auto-bookmark for the creating user
- `removeWithData()` → add cascade deletion of `userCompanies` rows (query via `by_company` index). Admin-only, not exposed in UI.

**Performance note:** Aggregate stats (report count, last report date) require per-company document scans. Acceptable for expected data sizes (<1000 companies). If this becomes a bottleneck, denormalize `reportCount`/`lastReportDate` onto the `companies` table.

### Modified: `convex/documents.ts`

- `create()` → store `uploadedBy` from auth identity
- `deleteDocument()` → verify `uploadedBy === currentUser` before allowing. Also delete associated storage files (`fileId`, `markdownFileId`) — fixes pre-existing storage leak.
- `generateUploadUrl()` → require auth
- Queries → include `uploadedBy` in returned data
- Remove "Slett alle dokumenter" (delete all documents) button from UI. Replace with "Slett mine dokumenter" (delete my documents) which only deletes documents where `uploadedBy === currentUser`.

### Modified: `convex/chatSessions.ts`

- `create()` → store `userId` from auth
- `list(companyId)` → filter by current `userId`
- Index: `by_company` → `by_user_company`

### Modified: `convex/chatMessages.ts`

- `create()` → require auth, verify parent session's `userId` matches caller
- `listBySession()` → require auth, verify parent session's `userId` matches caller

### Auth Enforcement

All Convex mutations and queries require authentication. Extract shared helper:

```typescript
// convex/lib/auth.ts
export async function requireAuth(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.subject;
}
```

### Migration Strategy

New fields (`uploadedBy` on documents, `userId` on chatSessions) are `v.optional(v.string())` in the schema. No backfill migration needed. Behavior for pre-existing rows:
- Documents without `uploadedBy`: no user can delete them (ownership check fails). Treated as system-uploaded.
- Chat sessions without `userId`: not returned by any user's query (filtered out). Effectively orphaned.

## UI Components

### New Components

| Component | Purpose |
|-----------|---------|
| `components/auth-guard.tsx` | Checks auth state, redirects to `/login` if unauthenticated |
| `components/browse/company-browse-card.tsx` | Browse card: name, ticker, report count, last updated, bookmark status |
| `components/browse/search-bar.tsx` | Debounced search input |
| `components/dashboard/dashboard-empty.tsx` | Empty state with CTA to browse |
| `components/dashboard/company-dashboard-card.tsx` | Dashboard card with "remove" action |

### Modified Components

| Component | Change |
|-----------|--------|
| `app/page.tsx` | Replace with redirect logic: authed → `/dashboard`, unauthed → `/login` |
| `app/selskap/[id]/page.tsx` | Update back-link href from `/` to `/dashboard` |
| `components/company-list.tsx` | Refactor to query `listMyCompanies()` instead of all companies |
| `components/dashboard/documents-tab.tsx` | Show uploader info, conditional delete button |
| `components/dashboard/chat-tab.tsx` | Sessions already filtered by backend, no major UI changes |
| `components/add-company-dialog.tsx` | No changes — backend auto-bookmarks |

### Design Consistency

- Same dark theme, accent colors (`#2DD4BF`), card styles, Phosphor icons
- Browse cards: slightly different layout to show metadata (report count, last updated)
- Bookmark indicator: Phosphor `Star` / `StarFill`

## Data Flows

### Login → Dashboard

1. User hits `/` → auth check → redirect to `/dashboard` or `/login`
2. Dashboard calls `listMyCompanies()` → bookmarked companies
3. Empty → show empty state with link to `/browse`

### Browse → Bookmark

1. `/browse` calls `search({ query })` → all companies + stats
2. Compare against `listMyCompanies()` for bookmark indicators
3. "Add to dashboard" → `addCompany(companyId)` → UI updates reactively

### Upload (Any User)

1. Upload PDF on `/selskap/[id]` documents tab
2. `uploadedBy` set from auth identity
3. Processing pipeline unchanged (PDF → markdown → metrics → chunks → embeddings)
4. All users viewing that company see new report via Convex reactivity

### Delete Report (Own Only)

1. Delete button rendered only where `uploadedBy === currentUser`
2. Backend verifies ownership before executing delete

### Chat (Private Per User)

1. Chat tab queries sessions filtered by `userId` on backend
2. New sessions created with `userId`
3. Messages scoped through session — no cross-user visibility

### Reactivity

Convex subscriptions ensure:
- Report uploads by any user appear in real-time for all viewers of that company
- Bookmark/unbookmark updates are instant on the user's dashboard
- Chat is isolated — no cross-user reactivity needed
