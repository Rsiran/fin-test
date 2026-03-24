# Feedback System Design

**Date:** 2026-03-24
**Status:** Draft

## Overview

Add an in-app feedback system to FinansAnalyse so 20 active testers can easily report bugs, suggest features, and share general feedback. Feedback is stored in Convex and instantly forwarded to a Slack channel via webhook.

## Requirements

- Testers can submit feedback from any page without navigating away
- Three categories: Bug, Ide, Annet
- Description is always mandatory
- Steps to reproduce is mandatory and only shown for Bug category
- Screenshot attachment is optional
- Page URL, user email, and browser info are auto-captured
- Feedback is stored in Convex for persistence
- Slack webhook notification with full context for immediate triage
- No admin view — Slack + Convex dashboard is sufficient for now
- No emojis in the UI
- Norwegian labels throughout

## Data Model

### `feedback` table (Convex schema)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `category` | `"bug" \| "feature" \| "general"` | Yes | Maps to UI labels: Bug, Ide, Annet |
| `description` | `string` | Yes | Free text |
| `stepsToReproduce` | `string` | For bugs | Only submitted when category is "bug" |
| `pageUrl` | `string` | Yes | Auto-captured from `window.location.href` |
| `userEmail` | `string` | Yes | Auto-filled from Convex auth session |
| `userAgent` | `string` | Yes | Auto-captured from `navigator.userAgent` |
| `screenshotId` | `Id<"_storage">` | No | Convex file storage reference |
| `createdAt` | `number` | Yes | `Date.now()` timestamp |

## UI Design

### Trigger: Edge Tab

- Vertical "FEEDBACK" tab fixed to the right edge of the viewport, vertically centered
- Teal (#2DD4BF) background, dark text, uppercase, bold
- Present on every page (mounted in root layout)
- Rounded left corners (right side flush with viewport edge)
- Subtle left shadow for depth

### Panel: Slide-in from Right

- Clicking the edge tab slides a panel in from the right
- Background dims behind the panel (click outside to dismiss)
- Panel background: #232323 (elevated surface)
- Left border: 1px solid #2a2a2a
- Close button (X) in top-right of panel header

### Form Fields

**Header:** "Send tilbakemelding"

**Category selector:** Horizontal pill buttons
- "Bug" — red tint when active (#f87171 border/text, #f8717133 background)
- "Ide" — teal tint when active (#2DD4BF border/text, #2DD4BF22 background)
- "Annet" — gray tint when active (#aaa text, #888888aa border)
- Unselected pills: muted gray (#666 text, #88888833 border)

**Description field:**
- Label: "BESKRIVELSE" with red asterisk (mandatory)
- Textarea with dark inset background (#1A1A1E)
- Placeholder varies by category:
  - Bug: "Hva skjedde? Hva forventet du skulle skje?"
  - Ide: "Beskriv ideen din..."
  - Annet: "Hva vil du fortelle oss?"

**Steps to reproduce (Bug only):**
- Label: "HVA GJORDE DU DA DET SKJEDDE?" with red asterisk (mandatory)
- Only visible when category is "Bug"
- Placeholder: 'F.eks: "Jeg klikket på Last opp, valgte en PDF, og ventet i 2 min uten at noe skjedde"'

**Screenshot (all categories):**
- Label: "SKJERMBILDE (VALGFRITT)"
- Dashed border drop zone
- Text: "Klikk eller dra inn et bilde"
- Accepts image files (png, jpg, gif, webp)
- Shows thumbnail preview after upload with remove option

**Submit button:**
- Full-width teal button: "Send inn"
- Disabled state when required fields are empty
- Trust signal below: "Sendes til Jonas"

### Success State

- After successful submission, form content replaced with "Takk!" message
- Panel auto-closes after 2 seconds
- Form resets for next submission

## Architecture

### Data Flow

```
User clicks edge tab
  → Panel slides open (CSS transition)
  → User fills form
  → User clicks "Send inn"
  → If screenshot: upload file to Convex storage → receive storageId
  → Call submitFeedback mutation with form data + storageId
  → Mutation validates and inserts into feedback table
  → Mutation schedules sendSlackNotification internal action
  → Action generates screenshot URL (if applicable)
  → Action POSTs formatted message to Slack webhook
  → UI shows "Takk!" → auto-closes after 2s
```

### Files

| Layer | Purpose | File |
|-------|---------|------|
| UI | Edge tab + slide-in panel component | `components/feedback-widget.tsx` |
| UI | Mount point (every page) | `app/layout.tsx` |
| Backend | Schema addition for feedback table | `convex/schema.ts` |
| Backend | submitFeedback mutation + sendSlackNotification action | `convex/feedback.ts` |
| Config | Slack webhook URL | Convex env var: `SLACK_WEBHOOK_URL` |

### Slack Notification Format

```
Bug Report                              (or "Feature Idea" / "General Feedback")
--------------------------------------------

Description:
<description text>

Steps to reproduce:                     (only for bugs)
<steps text>

Page: <pageUrl>
User: <userEmail>
Browser: <parsed userAgent summary>
Screenshot: <image block if present>
```

Posted via Slack Incoming Webhook. Screenshot included as an image block using a public Convex storage URL.

## Dependencies

- No new npm packages required
- Slack Incoming Webhook (free, 5-minute setup in Slack admin)
- Convex file storage (already available, no additional config)

## Setup Required

1. Create a Slack app with Incoming Webhooks enabled
2. Add webhook to a channel (e.g., #finansanalyse-feedback)
3. Set `SLACK_WEBHOOK_URL` environment variable in Convex dashboard

## Out of Scope

- Admin view for browsing feedback (use Slack + Convex dashboard)
- Feedback status tracking visible to testers
- Email notifications
- Severity/priority fields
- Upvoting or commenting on feedback
