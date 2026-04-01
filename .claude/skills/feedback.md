---
name: feedback
description: Triage and fix user feedback from Convex. Fetches unresolved feedback items newest-first, walks through triage (priority + action), and for items marked "fix now", investigates the codebase, implements the fix, and marks resolved after confirmation.
---

# Feedback Triage & Fix

Fetch user feedback from the Convex database, triage it, and fix issues interactively.

## Step 1: Fetch Feedback

Run this command to get all feedback from Convex:

```bash
npx convex run feedback:list
```

Parse the JSON output. Filter to items where `status` is `undefined`, `null`, or `"open"`. Order by `createdAt` descending (newest first).

If no unresolved items exist, tell the user "No unresolved feedback items" and stop.

## Step 2: Present Item

For each unresolved item, display it clearly:

```
--- Feedback #N of M ---
Category:    [bug / feature / general]
From:        [userEmail]
Date:        [createdAt formatted as human-readable]
Page:        [pageUrl]
Description: [description]
Steps:       [stepsToReproduce or "None provided"]
```

## Step 3: Triage Interview

Ask two questions, one at a time:

**Question 1 — Priority:**
> What priority? (A) Critical (B) High (C) Medium (D) Low

**Question 2 — Action:**
> What action? (A) Fix now (B) Skip — move to next (C) Dismiss — won't fix

### If "Dismiss":
Update the feedback record:
```bash
npx convex run feedback:updateStatus '{"id": "<feedback_id>", "status": "dismissed", "priority": "<chosen_priority>"}'
```
Move to the next item.

### If "Skip":
Update priority only:
```bash
npx convex run feedback:updateStatus '{"id": "<feedback_id>", "status": "open", "priority": "<chosen_priority>"}'
```
Move to the next item.

### If "Fix now":
Continue to Step 4.

## Step 4: Investigate & Fix

1. **Investigate**: Use the `pageUrl` and `description` to find relevant code. The pageUrl maps to routes in `app/` — e.g. `/selskap/[id]` maps to `app/selskap/[id]/page.tsx`. Search for related components and logic.

2. **Propose**: Explain what you think the issue is and propose a fix. Wait for user approval.

3. **Implement**: Make the code changes. Follow existing patterns in the codebase.

4. **Commit**: Create a commit with a message referencing the feedback (e.g. `fix: [description summary]`).

5. **Confirm resolution**: Ask the user:
   > Does this fix the issue? Should I mark it as resolved?

6. **If confirmed**: Update the record:
   ```bash
   npx convex run feedback:updateStatus '{"id": "<feedback_id>", "status": "resolved", "priority": "<chosen_priority>", "resolvedAt": <Date.now()>}'
   ```

7. **If not confirmed**: Ask what's still wrong and iterate on the fix.

## Step 5: Next Item

After resolving, dismissing, or skipping an item, move to the next unresolved item and repeat from Step 2. When all items are processed, summarize:

```
--- Triage Summary ---
Resolved: N
Dismissed: N
Skipped:  N
Remaining: N
```
