# Keep Me Signed In — Design Spec

## Problem

ConvexAuth uses persistent HTTP-only cookies by default, so users are always kept signed in across browser sessions. Users need the option to NOT persist their session (session ends when browser closes).

## Approach: localStorage + sessionStorage sentinel

Since ConvexAuth manages HTTP-only cookies that can't be manipulated from JavaScript, we use a client-side storage sentinel pattern to detect stale sessions and auto-sign-out.

### Shared utility: `lib/auth-storage.ts`

Extract storage key constants and helpers to avoid typo bugs across files:

- `KEYS.REMEMBER_ME = "remember-me"`
- `KEYS.ACTIVE_SESSION = "active-session"`
- `setRememberMe(value: boolean)` — sets or removes localStorage key
- `markSessionActive()` — sets sessionStorage key
- `clearAuthStorage()` — removes both keys
- `shouldAutoSignOut()` — returns `true` when neither key exists

### How it works

**On sign-in (`app/login/page.tsx` and `app/signup/page.tsx`):**

- Add `rememberMe` checkbox state, default `true`
- Label: "Husk meg" (Norwegian)
- Storage writes happen BEFORE `await signIn()` — ConvexAuth may trigger a redirect on success before the next line executes. On failure, `clearAuthStorage()` is called in the catch block to clean up:
  - `setRememberMe(rememberMe)`
  - `markSessionActive()`
- Signup page gets the same checkbox and logic

**On app mount (`app/convex-client-provider.tsx`):**

Add a `SessionSentinel` component inside the provider tree. Uses `useConvexAuth()` to check `isAuthenticated` and `isLoading` before acting:

1. If loading or not authenticated → do nothing (user is on login/signup or genuinely logged out)
2. `sessionStorage.active-session` exists → do nothing (active browser session)
3. `localStorage.remember-me` exists → call `markSessionActive()` and continue (user opted in)
4. Authenticated but neither key exists → call `signOut()` + `clearAuthStorage()` (browser reopened by user who unchecked "remember me")

While signing out, `SessionSentinel` renders `null` to prevent a flash of authenticated UI.

**On sign-out (any future sign-out trigger):**

Call `clearAuthStorage()` to remove both keys.

### Files changed

| File | Change |
|------|--------|
| `lib/auth-storage.ts` | New — storage key constants and helper functions |
| `app/login/page.tsx` | Add checkbox + call storage helpers before sign-in |
| `app/signup/page.tsx` | Add checkbox + call storage helpers before sign-up |
| `app/convex-client-provider.tsx` | Add SessionSentinel with `isAuthenticated`/`isLoading` guard |

### Edge cases

- **Multiple tabs**: `sessionStorage` is per-tab — each tab gets its own instance. For "remember me" users this is fine (step 3 catches it via localStorage). For non-"remember me" users, opening a second tab triggers step 4 and signs them out. This is acceptable: un-remembered sessions are effectively single-tab, which aligns with the security intent.
- **Explicit sign-out**: No sign-out button exists in the app currently. When added, it must call `clearAuthStorage()`.
- **signIn failure**: Storage writes happen before `signIn()`. On failure, `clearAuthStorage()` is called in the catch block to revert.

### UI placement

Checkbox sits between the password field and the submit button, styled with `text-sm text-[#AAAAAA]` to match existing form aesthetics. Uses accent color for the checked state.
