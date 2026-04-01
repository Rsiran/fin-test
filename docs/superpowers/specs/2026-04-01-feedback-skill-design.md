# Feedback Triage & Fix Skill — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Overview

A Claude Code skill (`/feedback`) that fetches user feedback from Convex, presents items newest-first, guides triage (priority + action), and for items marked "fix now", investigates the codebase, implements the fix, and marks the item resolved after user confirmation.

## Workflow

1. Fetch all feedback from Convex ordered newest-first
2. Filter to unresolved items (status is `undefined` or `"open"`)
3. Present the first item: category, description, steps to reproduce, page URL, user email, timestamp
4. Triage interview:
   - Priority: `critical` | `high` | `medium` | `low`
   - Action: `fix now` | `skip` (move to next) | `dismiss` (won't fix)
5. If "dismiss": update status to `"dismissed"` in Convex, move to next
6. If "fix now":
   - Investigate the issue (use pageUrl and description to find relevant code)
   - Propose a fix
   - Implement with user approval
   - Commit
   - Ask user to confirm resolution
   - If confirmed: update status to `"resolved"` + `resolvedAt` timestamp in Convex
7. Move to next unresolved item, repeat

## Schema Changes

Add to `feedback` table in `convex/schema.ts`:

```typescript
status: v.optional(v.string()),      // "open" | "resolved" | "dismissed"
priority: v.optional(v.string()),    // "critical" | "high" | "medium" | "low"
resolvedAt: v.optional(v.number()),  // timestamp
```

## New Mutation

Add `updateStatus` to `convex/feedback.ts`:

```typescript
export const updateStatus = mutation({
  args: {
    id: v.id("feedback"),
    status: v.string(),
    priority: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(id, patch);
  },
});
```

No auth check needed — this is an internal/admin operation invoked from the CLI skill, not a user-facing endpoint.

## Skill File

Location: `.claude/skills/feedback.md`

The skill file contains:
- Trigger: `/feedback`
- Instructions for fetching feedback via Convex HTTP API or MCP tools
- The triage interview flow
- Investigation and fix workflow
- Resolution confirmation and Convex update

## Files Changed

| File | Change |
|---|---|
| `convex/schema.ts` | Add `status`, `priority`, `resolvedAt` to feedback table |
| `convex/feedback.ts` | Add `updateStatus` mutation |
| `.claude/skills/feedback.md` | New skill file with full workflow |
