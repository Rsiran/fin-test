# Keep Me Signed In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a "Husk meg" (remember me) checkbox on login/signup that controls whether their session persists across browser restarts.

**Architecture:** localStorage sentinel (`remember-me`) marks persistent sessions; sessionStorage sentinel (`active-session`) marks active browser sessions. On app mount, if the user is authenticated but neither sentinel exists, auto-sign-out. A shared utility module holds all storage logic.

**Tech Stack:** Next.js, React, ConvexAuth (`@convex-dev/auth`), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-keep-me-signed-in-design.md`

---

### Task 1: Create auth storage utility

**Files:**
- Create: `lib/auth-storage.ts`

- [ ] **Step 1: Create `lib/auth-storage.ts`**

```ts
const KEYS = {
  REMEMBER_ME: "remember-me",
  ACTIVE_SESSION: "active-session",
} as const;

export function setRememberMe(value: boolean): void {
  if (value) {
    localStorage.setItem(KEYS.REMEMBER_ME, "true");
  } else {
    localStorage.removeItem(KEYS.REMEMBER_ME);
  }
}

export function markSessionActive(): void {
  sessionStorage.setItem(KEYS.ACTIVE_SESSION, "true");
}

export function clearAuthStorage(): void {
  localStorage.removeItem(KEYS.REMEMBER_ME);
  sessionStorage.removeItem(KEYS.ACTIVE_SESSION);
}

export function shouldAutoSignOut(): boolean {
  return (
    !sessionStorage.getItem(KEYS.ACTIVE_SESSION) &&
    !localStorage.getItem(KEYS.REMEMBER_ME)
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/auth-storage.ts
git commit -m "feat: add auth storage utility for session sentinel pattern"
```

---

### Task 2: Add "Husk meg" checkbox to login page

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Add rememberMe state**

After the existing `useState` declarations (line 11), add:

```ts
const [rememberMe, setRememberMe] = useState(true);
```

- [ ] **Step 2: Add import for auth-storage helpers**

Add to the imports at the top:

```ts
import { setRememberMe as persistRememberMe, markSessionActive } from "@/lib/auth-storage";
```

- [ ] **Step 3: Add storage writes around sign-in**

Write storage BEFORE `signIn()` — if the sign-in succeeds, ConvexAuth may trigger a redirect before the next line executes. If sign-in fails, clean up in the catch.

The full try/catch becomes:

```ts
try {
  persistRememberMe(rememberMe);
  markSessionActive();
  await signIn("password", { email, password, flow: "signIn" });
} catch {
  clearAuthStorage();
  setError("Feil e-post eller passord");
}
```

Also update the import to include `clearAuthStorage`:

```ts
import { setRememberMe as persistRememberMe, markSessionActive, clearAuthStorage } from "@/lib/auth-storage";
```

- [ ] **Step 4: Add checkbox UI**

Between the `{error && ...}` block and the submit `<button>`, add:

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
    className="accent-accent w-4 h-4"
  />
  <span className="text-sm text-[#AAAAAA]">Husk meg</span>
</label>
```

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add 'Husk meg' checkbox to login page"
```

---

### Task 3: Add "Husk meg" checkbox to signup page

**Files:**
- Modify: `app/signup/page.tsx`

- [ ] **Step 1: Add rememberMe state**

After the existing `useState` declarations (line 11), add:

```ts
const [rememberMe, setRememberMe] = useState(true);
```

- [ ] **Step 2: Add import for auth-storage helpers**

Add to the imports at the top:

```ts
import { setRememberMe as persistRememberMe, markSessionActive } from "@/lib/auth-storage";
```

- [ ] **Step 3: Add storage writes around sign-up**

Same pattern as login — write storage BEFORE `signIn()`, clean up on failure:

```ts
try {
  persistRememberMe(rememberMe);
  markSessionActive();
  await signIn("password", { email, password, flow: "signUp" });
} catch {
  clearAuthStorage();
  setError("Kunne ikke opprette konto. Prøv igjen.");
}
```

Also update the import to include `clearAuthStorage`:

```ts
import { setRememberMe as persistRememberMe, markSessionActive, clearAuthStorage } from "@/lib/auth-storage";
```

- [ ] **Step 4: Add checkbox UI**

Between the `{error && ...}` block and the submit `<button>`, add the same checkbox as login:

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
    className="accent-accent w-4 h-4"
  />
  <span className="text-sm text-[#AAAAAA]">Husk meg</span>
</label>
```

- [ ] **Step 5: Commit**

```bash
git add app/signup/page.tsx
git commit -m "feat: add 'Husk meg' checkbox to signup page"
```

---

### Task 4: Add session sentinel check to provider

**Files:**
- Modify: `app/convex-client-provider.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top:

```ts
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect } from "react";
import { shouldAutoSignOut, markSessionActive, clearAuthStorage } from "@/lib/auth-storage";
```

- [ ] **Step 2: Create inner sentinel component**

`useConvexAuth()` must be called inside the provider tree. Create an inner component:

```tsx
function SessionSentinel({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    if (shouldAutoSignOut()) {
      clearAuthStorage();
      signOut();
    } else {
      markSessionActive();
    }
  }, [isAuthenticated, isLoading, signOut]);

  return <>{children}</>;
}
```

- [ ] **Step 3: Wrap children in sentinel**

Update `ConvexClientProvider` to wrap children:

```tsx
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <SessionSentinel>{children}</SessionSentinel>
    </ConvexAuthNextjsProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/convex-client-provider.tsx
git commit -m "feat: add session sentinel — auto sign-out on browser reopen when not remembered"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test "remember me" checked (default)**

1. Go to `/login`, verify checkbox is checked by default
2. Sign in
3. Open DevTools → Application → Local Storage → confirm `remember-me` = `"true"`
4. Close browser, reopen → confirm still signed in

- [ ] **Step 3: Test "remember me" unchecked**

1. Sign out (or clear cookies)
2. Go to `/login`, uncheck "Husk meg"
3. Sign in
4. Confirm `remember-me` is NOT in localStorage
5. Close browser, reopen → confirm redirected to `/login`

- [ ] **Step 4: Test signup page**

1. Go to `/signup`, verify same checkbox exists
2. Sign up with checkbox checked → confirm `remember-me` in localStorage

- [ ] **Step 5: Final commit if any tweaks needed**
