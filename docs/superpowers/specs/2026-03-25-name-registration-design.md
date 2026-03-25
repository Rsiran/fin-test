# Name Registration Modal

## Problem

Users sign up with `@bi.no` emails and are auto-assigned a name derived from the email prefix (e.g. `s1234567`). There is no way for users to provide their real first name. All existing users with auto-generated names should also be prompted.

## Design

### Detection

A user needs to register their name when `nameConfirmed` is falsy on their user record:

```
!user.nameConfirmed
```

A boolean `nameConfirmed` flag avoids the edge case where a user's real first name happens to match their email prefix. The modal shows once; after submitting (even if they keep the same name), `nameConfirmed` is set to `true`.

### Modal Behavior

- **Blocking**: No close button, no backdrop click dismiss, no escape key dismiss
- **Placement**: Rendered inside `convex-client-provider.tsx`, after the auth-gated `Authenticated` boundary
- **Single field**: "Fornavn" (first name) input, pre-filled with current `name` value
- **Validation**: Non-empty after trim, max 50 characters
- **Loading state**: Button shows "Lagrer..." and is disabled while mutation is in flight
- **Error state**: Inline error text below the input if mutation fails
- **Submit**: "Lagre" button calls a `setName` mutation

### Backend Changes

**`convex/users.ts`**:

1. Add a new `meProfile` query (leave existing `me` query untouched to avoid breaking `documents-tab.tsx`):
   - Calls `getAuthUserId(ctx)`, then `ctx.db.get(userId)`
   - Returns `{ name, email, nameConfirmed }` or `null` if unauthenticated
2. Add a `setName` mutation that:
   - Calls `getAuthUserId(ctx)` — throws if unauthenticated
   - Never accepts a user ID argument (only updates the caller's own record)
   - Validates: non-empty after trim, max 50 characters
   - Updates both `name` and sets `nameConfirmed: true`

**`convex/schema.ts`**: No change needed — Convex Auth's `authTables` provides the `users` table with a `name` field, and Convex is schemaless for additional fields unless strict validation is configured.

### Frontend Changes

**New component: `components/name-registration-modal.tsx`**:

- Uses the existing modal/overlay pattern from `add-company-dialog.tsx`
- Matches existing form styling (inset shadow inputs, uppercase labels, accent button)
- Calls `useQuery(api.users.meProfile)` to get user data
- Renders when `user.nameConfirmed` is falsy
- Input pre-filled with `user.name` so users can keep it if it's their real name
- On submit, calls `setName` mutation; modal disappears reactively when `nameConfirmed` becomes `true`

**Integration point**: Render `<NameRegistrationModal />` inside `convex-client-provider.tsx`, within the `<Authenticated>` boundary that already wraps the app content.

### UI Spec

- Centered modal with `bg-black/60` backdrop
- Welcome heading: "Velkommen!"
- Subtitle: "Skriv inn fornavnet ditt for å komme i gang"
- Single input with label "FORNAVN", placeholder "f.eks. Ola", pre-filled with current name
- "Lagre" primary button (accent color), shows "Lagrer..." when loading
- Error text in `text-[#f87171]` below input if mutation fails
- No cancel/close button

## Out of Scope

- Last name / full name fields
- Profile page for editing name later
- Onboarding flow beyond name entry
