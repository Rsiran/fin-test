# Name Registration Modal

## Problem

Users sign up with `@bi.no` emails and are auto-assigned a name derived from the email prefix (e.g. `s1234567`). There is no way for users to provide their real first name. All existing users with auto-generated names should also be prompted.

## Design

### Detection

A user needs to register their name when:

```
user.name === user.email.split("@")[0]
```

No additional database flag needed — derived from existing data.

### Modal Behavior

- **Blocking**: No close button, no backdrop click dismiss, no escape key dismiss
- **Placement**: Rendered in the authenticated layout so it appears on any page
- **Single field**: "Fornavn" (first name) input
- **Validation**: Non-empty, trimmed, and must differ from the auto-generated email prefix
- **Submit**: "Lagre" button calls a Convex mutation to update the user's `name` field

### Backend Changes

**`convex/users.ts`**:

1. Extend the `me` query to return `name` and `email` (currently only returns `_id`)
2. Add a `setName` mutation that:
   - Validates the name is non-empty
   - Updates the `name` field on the authenticated user's record

### Frontend Changes

**New component: `components/name-registration-modal.tsx`**:

- Uses the existing modal/overlay pattern from `add-company-dialog.tsx`
- Matches existing form styling (inset shadow inputs, uppercase labels, accent button)
- Renders when `user.name === user.email.split("@")[0]`
- On submit, calls `setName` mutation, modal disappears reactively (Convex re-evaluates the condition)

**Integration point**: Render `<NameRegistrationModal />` inside `convex-client-provider.tsx` or the root authenticated layout, gated on auth state.

### UI Spec

- Centered modal with `bg-black/60` backdrop
- Welcome heading: "Velkommen!"
- Subtitle: "Skriv inn fornavnet ditt for å komme i gang"
- Single input with label "FORNAVN" and placeholder "f.eks. Ola"
- "Lagre" primary button (accent color)
- No cancel/close button

## Out of Scope

- Last name / full name fields
- Profile page for editing name later
- Onboarding flow beyond name entry
