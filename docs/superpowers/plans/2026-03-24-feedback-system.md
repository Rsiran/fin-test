# Feedback System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app feedback widget that lets testers report bugs, suggest features, and share feedback — stored in Convex with Slack webhook notifications.

**Architecture:** Edge tab trigger on right side of every page, slide-in panel with category-aware form, Convex mutation for persistence, internal action for Slack webhook POST. Screenshot uploads use Convex file storage.

**Tech Stack:** Next.js (React 19), Convex (mutation + internalAction), Slack Incoming Webhooks, Convex file storage, Phosphor Icons

**Spec:** `docs/superpowers/specs/2026-03-24-feedback-system-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `convex/schema.ts` | Add `feedback` table definition |
| Create | `convex/feedback.ts` | `submitFeedback` mutation + `generateScreenshotUploadUrl` mutation |
| Create | `convex/feedbackActions.ts` | `sendSlackNotification` internal action (`"use node"` — must be separate from mutations) |
| Create | `components/feedback-widget.tsx` | Edge tab + slide-in panel + form UI |
| Modify | `app/layout.tsx` | Mount `FeedbackWidget` inside `ConvexClientProvider` |

---

### Task 1: Add feedback table to Convex schema

**Files:**
- Modify: `convex/schema.ts:87-94` (add after `watchlist` table, before closing `});`)

- [ ] **Step 1: Add the feedback table definition**

Add after the `watchlist` table (line 93) and before the closing `});` on line 94:

```typescript
  feedback: defineTable({
    category: v.union(
      v.literal("bug"),
      v.literal("feature"),
      v.literal("general")
    ),
    description: v.string(),
    stepsToReproduce: v.optional(v.string()),
    pageUrl: v.string(),
    userEmail: v.string(),
    userAgent: v.string(),
    screenshotId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_category", ["category"]),
```

- [ ] **Step 2: Verify schema compiles**

Run: `npx convex dev --once`
Expected: Schema successfully pushed, no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(feedback): add feedback table to Convex schema"
```

---

### Task 2: Create Convex feedback backend

**Files:**
- Create: `convex/feedback.ts` (mutations — default Convex runtime)
- Create: `convex/feedbackActions.ts` (internal action — `"use node"` runtime)

**Important:** Convex requires `"use node"` files to only contain actions, not mutations. The existing codebase follows this pattern: `cleanupActions.ts` has `"use node"` + `internalAction`, while `cleanup.ts` has mutations. We follow the same split here.

- [ ] **Step 1: Create `convex/feedback.ts` with mutations**

```typescript
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const generateScreenshotUploadUrl = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    category: v.union(
      v.literal("bug"),
      v.literal("feature"),
      v.literal("general")
    ),
    description: v.string(),
    stepsToReproduce: v.optional(v.string()),
    pageUrl: v.string(),
    userAgent: v.string(),
    screenshotId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    // Get email from auth identity (server-side, not client-trusted)
    const identity = await ctx.auth.getUserIdentity();
    const userEmail = identity?.email ?? "ukjent";

    const feedbackId = await ctx.db.insert("feedback", {
      ...args,
      userEmail,
      createdAt: Date.now(),
    });

    // Get screenshot URL if present
    let screenshotUrl: string | null = null;
    if (args.screenshotId) {
      screenshotUrl = await ctx.storage.getUrl(args.screenshotId);
    }

    // Schedule Slack notification (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.feedbackActions.sendSlackNotification,
      {
        category: args.category,
        description: args.description,
        stepsToReproduce: args.stepsToReproduce,
        pageUrl: args.pageUrl,
        userEmail,
        userAgent: args.userAgent,
        screenshotUrl: screenshotUrl ?? undefined,
      }
    );

    return feedbackId;
  },
});
```

- [ ] **Step 2: Create `convex/feedbackActions.ts` with the Slack notification action**

```typescript
"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const sendSlackNotification = internalAction({
  args: {
    category: v.string(),
    description: v.string(),
    stepsToReproduce: v.optional(v.string()),
    pageUrl: v.string(),
    userEmail: v.string(),
    userAgent: v.string(),
    screenshotUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("SLACK_WEBHOOK_URL not set, skipping notification");
      return;
    }

    const categoryLabels: Record<string, string> = {
      bug: "Bug Report",
      feature: "Feature Idea",
      general: "General Feedback",
    };

    const header = categoryLabels[args.category] ?? "Feedback";
    const browser = parseBrowser(args.userAgent);

    let text = `*${header}*\n${"─".repeat(40)}\n\n`;
    text += `*Description:*\n${args.description}\n\n`;

    if (args.stepsToReproduce) {
      text += `*Steps to reproduce:*\n${args.stepsToReproduce}\n\n`;
    }

    text += `*Page:* ${args.pageUrl}\n`;
    text += `*User:* ${args.userEmail}\n`;
    text += `*Browser:* ${browser}\n`;

    const blocks: unknown[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
    ];

    if (args.screenshotUrl) {
      blocks.push({
        type: "image",
        image_url: args.screenshotUrl,
        alt_text: "Screenshot",
      });
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  },
});

function parseBrowser(userAgent: string): string {
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    const match = userAgent.match(/Chrome\/([\d.]+)/);
    return `Chrome ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    const match = userAgent.match(/Version\/([\d.]+)/);
    return `Safari ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  if (userAgent.includes("Firefox")) {
    const match = userAgent.match(/Firefox\/([\d.]+)/);
    return `Firefox ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  if (userAgent.includes("Edg")) {
    const match = userAgent.match(/Edg\/([\d.]+)/);
    return `Edge ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  return userAgent.slice(0, 50);
}
```

- [ ] **Step 3: Verify backend compiles**

Run: `npx convex dev --once`
Expected: Functions deployed successfully. You should see `feedback.submit`, `feedback.generateScreenshotUploadUrl`, and `feedbackActions.sendSlackNotification` listed.

- [ ] **Step 4: Commit**

```bash
git add convex/feedback.ts convex/feedbackActions.ts
git commit -m "feat(feedback): add submit mutation and Slack notification action"
```

---

### Task 3: Create feedback widget component

**Files:**
- Create: `components/feedback-widget.tsx`

**Reference files for patterns:**
- `components/add-company-dialog.tsx` — modal overlay, form inputs, button styling, Phosphor icons
- `components/upload-dropzone.tsx` — file upload drag-and-drop pattern (if needed for reference)

- [ ] **Step 1: Create `components/feedback-widget.tsx`**

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { X } from "@phosphor-icons/react";

type Category = "bug" | "feature" | "general";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Ide" },
  { value: "general", label: "Annet" },
];

const CATEGORY_STYLES: Record<Category, { active: string; ring: string }> = {
  bug: {
    active:
      "bg-[#f8717133] text-[#f87171] border-[#f87171aa] shadow-[0_0_8px_#f8717122]",
    ring: "border-[#f87171aa]",
  },
  feature: {
    active:
      "bg-[#2DD4BF22] text-accent border-[#2DD4BF88] shadow-[0_0_8px_#2DD4BF22]",
    ring: "border-[#2DD4BF88]",
  },
  general: {
    active:
      "bg-[#88888822] text-[#aaa] border-[#888888aa] shadow-[0_0_8px_#88888822]",
    ring: "border-[#888888aa]",
  },
};

const PLACEHOLDERS: Record<Category, string> = {
  bug: "Hva skjedde? Hva forventet du skulle skje?",
  feature: "Beskriv ideen din...",
  general: "Hva vil du fortelle oss?",
};

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitFeedback = useMutation(api.feedback.submit);
  const generateUploadUrl = useMutation(api.feedback.generateScreenshotUploadUrl);

  const resetForm = useCallback(() => {
    setCategory("bug");
    setDescription("");
    setStepsToReproduce("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSubmitted(false);
    resetForm();
  }, [resetForm]);

  const handleScreenshot = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    if (category === "bug" && !stepsToReproduce.trim()) return;

    setSubmitting(true);
    try {
      let screenshotId: string | undefined;

      if (screenshotFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": screenshotFile.type },
          body: screenshotFile,
        });
        const { storageId } = await result.json();
        screenshotId = storageId;
      }

      await submitFeedback({
        category,
        description: description.trim(),
        stepsToReproduce:
          category === "bug" ? stepsToReproduce.trim() : undefined,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        screenshotId: screenshotId as any,
      });

      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    description.trim().length > 0 &&
    (category !== "bug" || stepsToReproduce.trim().length > 0);

  return (
    <>
      {/* Edge tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed top-1/2 right-0 -translate-y-1/2 z-40 bg-accent text-base font-bold text-[10px] tracking-[1.5px] uppercase px-[5px] py-3 rounded-l-md shadow-[-2px_0_8px_rgba(45,212,191,0.2)] hover:brightness-90 transition-all duration-150"
          style={{ writingMode: "vertical-rl" }}
        >
          FEEDBACK
        </button>
      )}

      {/* Slide-in panel */}
      {open && (
        <div className="fixed inset-0 z-50" onClick={handleClose}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Panel */}
          <div
            className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-elevated border-l border-white/5 shadow-[-4px_0_20px_rgba(0,0,0,0.4)] flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {submitted ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-lg font-semibold">Takk!</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-0">
                  <h2 className="text-lg font-semibold">
                    Send tilbakemelding
                  </h2>
                  <button
                    onClick={handleClose}
                    className="text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Form */}
                <form
                  onSubmit={handleSubmit}
                  className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto"
                >
                  {/* Category pills */}
                  <div className="flex gap-2">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${
                          category === opt.value
                            ? CATEGORY_STYLES[opt.value].active
                            : "bg-transparent text-[#666] border-[#88888833] hover:border-[#88888866]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
                      Beskrivelse{" "}
                      <span className="text-[#f87171]">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={PLACEHOLDERS[category]}
                      rows={4}
                      className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666] resize-none"
                    />
                  </div>

                  {/* Steps to reproduce (bug only) */}
                  {category === "bug" && (
                    <div>
                      <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
                        Hva gjorde du da det skjedde?{" "}
                        <span className="text-[#f87171]">*</span>
                      </label>
                      <textarea
                        value={stepsToReproduce}
                        onChange={(e) => setStepsToReproduce(e.target.value)}
                        placeholder='F.eks: "Jeg klikket på Last opp, valgte en PDF, og ventet i 2 min uten at noe skjedde"'
                        rows={3}
                        className="w-full bg-base rounded-lg px-3 py-2.5 text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] placeholder:text-[#666666] resize-none"
                      />
                    </div>
                  )}

                  {/* Screenshot */}
                  <div>
                    <label className="block text-[9px] font-sans uppercase tracking-[1px] text-[#666666] mb-1.5">
                      Skjermbilde (valgfritt)
                    </label>
                    {screenshotPreview ? (
                      <div className="relative">
                        <img
                          src={screenshotPreview}
                          alt="Screenshot"
                          className="w-full rounded-lg border border-white/5"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setScreenshotFile(null);
                            setScreenshotPreview(null);
                          }}
                          className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-[#666666] hover:text-[#F5F5F5] transition-colors duration-150"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files[0];
                          if (file) handleScreenshot(file);
                        }}
                        className="w-full bg-base border border-dashed border-[#444] rounded-lg py-4 text-center text-[#666666] text-xs hover:border-[#666] transition-colors duration-150"
                      >
                        Klikk eller dra inn et bilde
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleScreenshot(file);
                      }}
                    />
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Submit */}
                  <div>
                    <button
                      type="submit"
                      disabled={!isValid || submitting}
                      className="w-full py-2.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Sender..." : "Send inn"}
                    </button>
                    <p className="text-center text-[9px] text-[#555] mt-1.5">
                      Sendes til Jonas
                    </p>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add slide-in animation to `app/globals.css`**

Add this keyframe animation at the end of the CSS file:

```css
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.animate-slide-in-right {
  animation: slide-in-right 200ms ease-out;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/feedback-widget.tsx app/globals.css
git commit -m "feat(feedback): add feedback widget component with slide-in panel"
```

---

### Task 4: Mount widget in root layout

**Files:**
- Modify: `app/layout.tsx:34` (add FeedbackWidget inside ConvexClientProvider)

- [ ] **Step 1: Add FeedbackWidget to root layout**

In `app/layout.tsx`, add the import at the top:

```typescript
import { FeedbackWidget } from "@/components/feedback-widget";
```

Then change line 34 from:

```tsx
<ConvexClientProvider>{children}</ConvexClientProvider>
```

to:

```tsx
<ConvexClientProvider>
  {children}
  <FeedbackWidget />
</ConvexClientProvider>
```

- [ ] **Step 2: Verify the app compiles and the widget appears**

Run: `npm run dev`

Expected: App loads. A teal "FEEDBACK" edge tab is visible on the right side of every page. Clicking it opens the slide-in panel. The form works but submission will fail until `SLACK_WEBHOOK_URL` is configured in Convex (the mutation + DB insert will still succeed — the Slack action just logs a warning).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(feedback): mount feedback widget in root layout"
```

---

### Task 5: Configure Slack webhook

This is a manual setup task, not code changes.

- [ ] **Step 1: Create Slack app and webhook**

1. Go to https://api.slack.com/apps → Create New App → From Scratch
2. Name it "FinansAnalyse Feedback", pick your workspace
3. Go to "Incoming Webhooks" → Activate
4. Click "Add New Webhook to Workspace"
5. Select a channel (e.g., `#finansanalyse-feedback`)
6. Copy the webhook URL

- [ ] **Step 2: Set environment variable in Convex**

Run: `npx convex env set SLACK_WEBHOOK_URL "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"`

- [ ] **Step 3: Test end-to-end**

1. Open the app in browser
2. Click the FEEDBACK tab
3. Select "Bug", fill description and steps, hit "Send inn"
4. Verify: record appears in Convex dashboard `feedback` table
5. Verify: Slack message appears in the channel with all fields formatted

- [ ] **Step 4: Commit any env documentation**

No code commit needed — env vars live in Convex dashboard only. Optionally add `SLACK_WEBHOOK_URL` to a `.env.example` or README if one exists.
