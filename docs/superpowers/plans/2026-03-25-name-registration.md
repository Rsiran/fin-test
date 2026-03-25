# Name Registration Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a blocking modal that requires every user to enter their first name before using the app.

**Architecture:** New `meProfile` Convex query returns user profile data. New `setName` mutation updates the name and sets a `nameConfirmed` flag. A `NameRegistrationModal` component renders inside the authenticated boundary in `convex-client-provider.tsx` and blocks the UI until the user confirms their name.

**Tech Stack:** Convex (backend mutations/queries), React (frontend component), Next.js App Router, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-25-name-registration-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `convex/users.ts` | Add `meProfile` query and `setName` mutation |
| Modify | `app/convex-client-provider.tsx` | Render `NameRegistrationModal` inside auth boundary |
| Create | `components/name-registration-modal.tsx` | Blocking modal UI for first name entry |

---

### Task 1: Add `meProfile` query to Convex

**Files:**
- Modify: `convex/users.ts`

- [ ] **Step 1: Add the `meProfile` query**

Add a new query below the existing `me` query. This fetches the full user document and returns the fields the modal needs. The existing `me` query stays untouched.

```typescript
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

// existing me query stays as-is

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
```

- [ ] **Step 2: Verify the dev server accepts the new query**

Run: `npx convex dev` (if not already running) and check there are no type errors in the terminal output. The query should appear in the Convex dashboard.

- [ ] **Step 3: Commit**

```bash
git add convex/users.ts
git commit -m "feat: add meProfile query for name registration"
```

---

### Task 2: Add `setName` mutation to Convex

**Files:**
- Modify: `convex/users.ts`

- [ ] **Step 1: Add the `setName` mutation**

Append to `convex/users.ts` below the `meProfile` query:

```typescript
export const setName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const trimmed = args.name.trim();
    if (trimmed.length === 0) throw new Error("Name cannot be empty");
    if (trimmed.length > 50) throw new Error("Name too long");

    await ctx.db.patch(userId, {
      name: trimmed,
      nameConfirmed: true,
    });
  },
});
```

- [ ] **Step 2: Verify the dev server accepts the mutation**

Check the Convex dev terminal for errors. The mutation should appear in the Convex dashboard under `users.setName`.

- [ ] **Step 3: Commit**

```bash
git add convex/users.ts
git commit -m "feat: add setName mutation for name registration"
```

---

### Task 3: Create the `NameRegistrationModal` component

**Files:**
- Create: `components/name-registration-modal.tsx`

- [ ] **Step 1: Create the modal component**

Create `components/name-registration-modal.tsx` with the following content. This follows the exact same modal/form patterns used in `components/add-company-dialog.tsx`:

```tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export function NameRegistrationModal() {
  const profile = useQuery(api.users.meProfile);
  const setName = useMutation(api.users.setName);
  const [name, setNameValue] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill with current name once loaded
  if (profile && !initialized) {
    setNameValue(profile.name ?? "");
    setInitialized(true);
  }

  // Don't render if still loading, not authenticated, or already confirmed
  if (profile === undefined || profile === null || profile.nameConfirmed) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Skriv inn fornavnet ditt");
      return;
    }
    if (trimmed.length > 50) {
      setError("Navnet kan maks være 50 tegn");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setName({ name: trimmed });
    } catch {
      setError("Noe gikk galt. Prøv igjen.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-elevated rounded-card shadow-card p-6 w-full max-w-md">
        <div className="text-center mb-5">
          <h2 className="text-lg font-semibold">Velkommen!</h2>
          <p className="text-sm text-[#888888] mt-1">
            Skriv inn fornavnet ditt for å komme i gang
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
              Fornavn
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setNameValue(e.target.value);
                setError("");
              }}
              placeholder="f.eks. Ola"
              className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666]"
              autoFocus
              maxLength={50}
            />
            {error && (
              <p className="text-[#f87171] text-xs mt-1.5">{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium disabled:opacity-50"
          >
            {saving ? "Lagrer..." : "Lagre"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx next build --no-lint` or check the dev server terminal for compile errors. The component should compile without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/name-registration-modal.tsx
git commit -m "feat: add NameRegistrationModal component"
```

---

### Task 4: Integrate modal into the authenticated layout

**Files:**
- Modify: `app/convex-client-provider.tsx`

- [ ] **Step 1: Import and render the modal inside `SessionSentinel`**

The `SessionSentinel` component already gates on `isAuthenticated`, so this is the correct place. Add the import at the top and render the modal alongside the children:

In `app/convex-client-provider.tsx`, add import:

```typescript
import { NameRegistrationModal } from "@/components/name-registration-modal";
```

Then modify the `SessionSentinel` return statement (line 31) from:

```tsx
  return <>{children}</>;
```

to:

```tsx
  return (
    <>
      <NameRegistrationModal />
      {children}
    </>
  );
```

- [ ] **Step 2: Verify the app loads correctly**

Open the app in the browser. If logged in with an existing user whose `nameConfirmed` is falsy (all existing users), the modal should appear. It should block interaction with the page behind it.

- [ ] **Step 3: Test the full flow**

1. Load the app — modal should appear with the current name pre-filled
2. Clear the input and try to submit — should show "Skriv inn fornavnet ditt" error
3. Type a valid name and click "Lagre" — modal should disappear, app should be usable
4. Refresh the page — modal should NOT reappear (nameConfirmed is true)

- [ ] **Step 4: Commit**

```bash
git add app/convex-client-provider.tsx
git commit -m "feat: integrate name registration modal into auth layout"
```
