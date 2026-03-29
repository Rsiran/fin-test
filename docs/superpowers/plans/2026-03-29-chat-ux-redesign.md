# Chat UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the financial chat interface into a terminal-aesthetic split-pane research workspace with inline chart generation.

**Architecture:** Split-pane layout — chat on left, persistent sources panel on right. Terminal styling with left-border messages, monospace labels, teal-highlighted financial numbers. Inline charts via OpenAI function calling → Recharts. New `chart` field on chatMessages schema for persistence.

**Tech Stack:** Next.js 15.5 (App Router), React 19, Convex (backend), OpenAI GPT-4o (function calling), Recharts (charts), TailwindCSS, react-markdown

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/schema.ts` | Modify | Add optional `chart` field to chatMessages |
| `convex/chatMessages.ts` | Modify | Accept chart data in create mutation |
| `components/chat/cited-text.tsx` | Create | Markdown rendering with inline citation buttons |
| `components/chat/inline-chart.tsx` | Create | Recharts bar/line chart renderer from chart config |
| `components/chat/message.tsx` | Create | Single message with terminal styling, citations, charts |
| `components/chat/sources-panel.tsx` | Create | Right-side sources pane with source cards |
| `components/chat/chat-input.tsx` | Create | Auto-growing textarea + suggested prompts |
| `components/chat/chat-workspace.tsx` | Create | Top-level split-pane layout, state management, SSE streaming |
| `app/api/chat/route.ts` | Modify | Add create_chart tool, handle tool calls, stream chart events |
| `components/dashboard/chat-tab.tsx` | Modify | Pass company name, use ChatWorkspace |
| `components/chat-interface.tsx` | Delete | Replaced by chat-workspace.tsx |

---

### Task 1: Add chart field to Convex schema

**Files:**
- Modify: `convex/schema.ts:84-98`
- Modify: `convex/chatMessages.ts:22-52`

- [ ] **Step 1: Add chart field to chatMessages schema**

In `convex/schema.ts`, add an optional `chart` field to the `chatMessages` table definition. Insert after the `sources` field (line 96):

```typescript
  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.string(),
    content: v.string(),
    sources: v.optional(
      v.array(
        v.object({
          chunkId: v.id("chunks"),
          content: v.string(),
          pageRange: v.optional(v.string()),
        })
      )
    ),
    chart: v.optional(v.object({
      type: v.union(v.literal("bar"), v.literal("line")),
      title: v.string(),
      labels: v.array(v.string()),
      datasets: v.array(v.object({
        label: v.string(),
        values: v.array(v.number()),
      })),
      unit: v.optional(v.string()),
    })),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
```

- [ ] **Step 2: Update chatMessages.create mutation to accept chart**

In `convex/chatMessages.ts`, add `chart` to the args validator:

```typescript
export const create = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    role: v.string(),
    content: v.string(),
    sources: v.optional(
      v.array(
        v.object({
          chunkId: v.id("chunks"),
          content: v.string(),
          pageRange: v.optional(v.string()),
        })
      )
    ),
    chart: v.optional(v.object({
      type: v.union(v.literal("bar"), v.literal("line")),
      title: v.string(),
      labels: v.array(v.string()),
      datasets: v.array(v.object({
        label: v.string(),
        values: v.array(v.number()),
      })),
      unit: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Ikke autentisert");

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("Ingen tilgang til denne økten");
    }

    return await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Verify Convex schema pushes cleanly**

Run: `npx convex dev --once`
Expected: Schema validation passes, no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/chatMessages.ts
git commit -m "feat: add chart field to chatMessages schema"
```

---

### Task 2: Create CitedText component

**Files:**
- Create: `components/chat/cited-text.tsx`

This extracts and refines the existing `CitedText` from `components/chat-interface.tsx`. The component renders markdown text with `[N]` and `[Kilde N]` patterns as clickable citation buttons.

- [ ] **Step 1: Create cited-text.tsx**

```tsx
"use client";

import ReactMarkdown from "react-markdown";

interface SourceMeta {
  index: number;
  chunkId: string;
  content: string;
  pageRange?: string;
}

export function CitedText({
  text,
  sources,
  onCiteClick,
}: {
  text: string;
  sources: SourceMeta[];
  onCiteClick: (source: SourceMeta) => void;
}) {
  const segments = text.split(/(\[(?:Kilde\s*)?\d+\])/g);

  return (
    <div className="cited-text">
      {segments.map((segment, i) => {
        const citeMatch = segment.match(/^\[(?:Kilde\s*)?(\d+)\]$/);
        if (citeMatch) {
          const idx = parseInt(citeMatch[1], 10);
          const source = sources.find((s) => s.index === idx);
          if (source) {
            return (
              <button
                key={i}
                onClick={() => onCiteClick(source)}
                className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono font-bold bg-accent/[0.18] text-accent rounded-[3px] hover:bg-accent/[0.35] transition-colors duration-150 mx-0.5 align-middle cursor-pointer"
                title={`Kilde ${idx}`}
              >
                {idx}
              </button>
            );
          }
          return <span key={i}>[{idx}]</span>;
        }

        if (!segment.trim()) return null;
        return (
          <ReactMarkdown
            key={i}
            components={{
              p: ({ children }) => <span className="inline">{children} </span>,
              strong: ({ children }) => (
                <strong className="font-semibold text-[#e8e8e8]">{children}</strong>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside ml-4 mb-2 space-y-1">{children}</ol>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside ml-4 mb-2 space-y-1">{children}</ul>
              ),
              li: ({ children }) => <li className="text-sm">{children}</li>,
              h3: ({ children }) => (
                <h3 className="font-semibold text-base mt-3 mb-1">{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="font-semibold text-sm mt-2 mb-1">{children}</h4>
              ),
              code: ({ children }) => (
                <code className="font-mono text-accent bg-accent/10 px-1 rounded text-xs">
                  {children}
                </code>
              ),
            }}
          >
            {segment}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

export type { SourceMeta };
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/cited-text.tsx
git commit -m "feat: create CitedText component for markdown + citations"
```

---

### Task 3: Create InlineChart component

**Files:**
- Create: `components/chat/inline-chart.tsx`

Renders bar and line charts from a chart config object using Recharts. Includes a "Tabell" toggle to switch between chart and data table views.

- [ ] **Step 1: Create inline-chart.tsx**

```tsx
"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartConfig {
  type: "bar" | "line";
  title: string;
  labels: string[];
  datasets: { label: string; values: number[] }[];
  unit?: string;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-elevated border border-white/10 rounded-md px-3 py-2 shadow-card text-xs">
      <p className="font-mono text-[#999] mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-accent font-mono font-semibold">
          {entry.value.toLocaleString("nb-NO")} {unit || ""}
        </p>
      ))}
    </div>
  );
}

export function InlineChart({ config }: { config: ChartConfig }) {
  const [showTable, setShowTable] = useState(false);

  const data = config.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    config.datasets.forEach((ds) => {
      point[ds.label] = ds.values[i] ?? 0;
    });
    return point;
  });

  const handleExport = () => {
    const header = ["", ...config.labels].join(",");
    const rows = config.datasets.map(
      (ds) => [ds.label, ...ds.values.map((v) => v.toString())].join(",")
    );
    const csv = [header, ...rows].join("\n");
    navigator.clipboard.writeText(csv);
  };

  return (
    <div className="my-3 bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-white/[0.04]">
        <span className="text-[11px] font-semibold text-[#999]">{config.title}</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowTable((v) => !v)}
            className="font-mono text-[9px] px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-[#555] hover:bg-white/[0.08] hover:text-[#888] transition-colors"
          >
            {showTable ? "Graf" : "Tabell"}
          </button>
          <button
            onClick={handleExport}
            className="font-mono text-[9px] px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-[#555] hover:bg-white/[0.08] hover:text-[#888] transition-colors"
          >
            Eksporter
          </button>
        </div>
      </div>

      {/* Chart or Table */}
      {showTable ? (
        <div className="p-3.5 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-1.5 text-[#555] font-normal"></th>
                {config.labels.map((l) => (
                  <th key={l} className="text-right py-1.5 text-[#555] font-normal px-2">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.datasets.map((ds) => (
                <tr key={ds.label} className="border-b border-white/[0.03]">
                  <td className="py-1.5 text-[#888]">{ds.label}</td>
                  {ds.values.map((v, i) => (
                    <td key={i} className="text-right py-1.5 text-accent px-2">
                      {v.toLocaleString("nb-NO")} {config.unit || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            {config.type === "bar" ? (
              <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid
                  strokeDasharray="none"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#444", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip content={<ChartTooltipContent unit={config.unit} />} />
                {config.datasets.map((ds, i) => (
                  <Bar
                    key={ds.label}
                    dataKey={ds.label}
                    fill={`rgba(45,212,191,${0.3 + i * 0.2})`}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(45,212,191,0.2)" />
                    <stop offset="100%" stopColor="rgba(45,212,191,0)" />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="none"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#444", fontSize: 10, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip content={<ChartTooltipContent unit={config.unit} />} />
                {config.datasets.map((ds) => (
                  <Line
                    key={ds.label}
                    type="monotone"
                    dataKey={ds.label}
                    stroke="#2DD4BF"
                    strokeWidth={2}
                    dot={{ fill: "#2DD4BF", stroke: "#111113", strokeWidth: 2, r: 3.5 }}
                    activeDot={{ r: 5 }}
                    fill="url(#chartAreaGradient)"
                  />
                ))}
                {config.datasets.map((ds) => (
                  <Area
                    key={`area-${ds.label}`}
                    type="monotone"
                    dataKey={ds.label}
                    fill="url(#chartAreaGradient)"
                    stroke="none"
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/inline-chart.tsx
git commit -m "feat: create InlineChart component with bar/line charts and table toggle"
```

---

### Task 4: Create Message component

**Files:**
- Create: `components/chat/message.tsx`

Terminal-styled message component. User messages get a teal left-border, assistant messages get a gray left-border. Renders CitedText for assistant messages with sources, InlineChart when chart data is present, and source chips below.

- [ ] **Step 1: Create message.tsx**

```tsx
"use client";

import { CitedText, type SourceMeta } from "./cited-text";
import { InlineChart, type ChartConfig } from "./inline-chart";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: SourceMeta[];
  chart?: ChartConfig;
  onCiteClick?: (source: SourceMeta) => void;
  isStreaming?: boolean;
}

export function Message({
  role,
  content,
  sources = [],
  chart,
  onCiteClick,
  isStreaming,
}: MessageProps) {
  const isUser = role === "user";

  return (
    <div className={`max-w-[90%] ${isUser ? "self-end" : "self-start"}`}>
      {/* Label */}
      <div className="font-mono text-[9px] tracking-[1.5px] uppercase text-[#555] mb-1">
        {isUser ? "Du" : "Analyse"}
      </div>

      {/* Message body */}
      <div
        className={`px-4 py-3 rounded-r-md text-sm leading-relaxed ${
          isUser
            ? "border-l-2 border-accent/[0.35] bg-accent/[0.06] text-[#ddd]"
            : "border-l-2 border-white/[0.08] bg-white/[0.025] text-[#b0b0b0]"
        }`}
      >
        {!isUser && sources.length > 0 && onCiteClick ? (
          <CitedText text={content} sources={sources} onCiteClick={onCiteClick} />
        ) : (
          <span className="whitespace-pre-wrap">{content}</span>
        )}

        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 align-middle animate-pulse" />
        )}

        {/* Inline chart */}
        {chart && <InlineChart config={chart} />}

        {/* Source chips */}
        {!isUser && sources.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-white/[0.04] flex gap-1.5 flex-wrap items-center">
            <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-[#444] mr-1">
              Kilder
            </span>
            {sources.map((s) => (
              <button
                key={s.index}
                onClick={() => onCiteClick?.(s)}
                className="font-mono text-[9px] px-2 py-0.5 rounded bg-accent/[0.06] text-accent border border-accent/[0.15] hover:bg-accent/[0.15] hover:border-accent/[0.3] transition-colors cursor-pointer"
              >
                {s.index} · {s.pageRange ? `s. ${s.pageRange}` : `kilde`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/message.tsx
git commit -m "feat: create Message component with terminal styling"
```

---

### Task 5: Create SourcesPanel component

**Files:**
- Create: `components/chat/sources-panel.tsx`

Right-side panel showing all source cards. Active source is highlighted with teal border and auto-scrolled into view.

- [ ] **Step 1: Create sources-panel.tsx**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { SourceMeta } from "./cited-text";

interface SourcesPanelProps {
  sources: SourceMeta[];
  activeSourceIndex: number | null;
  onSourceClick: (source: SourceMeta) => void;
}

export function SourcesPanel({ sources, activeSourceIndex, onSourceClick }: SourcesPanelProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSourceIndex]);

  return (
    <div className="w-[380px] flex-shrink-0 flex flex-col bg-white/[0.01] border-l border-white/[0.06]">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-[#555]">
          Kilder
        </span>
        {sources.length > 0 && (
          <span className="font-mono text-[9px] text-[#444] px-1.5 py-0.5 bg-white/[0.04] rounded">
            {sources.length} {sources.length === 1 ? "kilde" : "kilder"}
          </span>
        )}
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {sources.length === 0 ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2 text-[#333]">
            <span className="text-[11px]">Ingen kilder enda</span>
          </div>
        ) : (
          sources.map((source) => {
            const isActive = activeSourceIndex === source.index;
            return (
              <div
                key={source.index}
                ref={isActive ? activeRef : undefined}
                onClick={() => onSourceClick(source)}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                  isActive
                    ? "bg-accent/[0.04] border-accent/[0.15]"
                    : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.035] hover:border-white/[0.08]"
                }`}
              >
                {/* Card header */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isActive
                        ? "bg-accent/[0.25] text-accent"
                        : "bg-accent/[0.12] text-accent"
                    }`}
                  >
                    {source.index}
                  </span>
                  {source.pageRange && (
                    <span className="font-mono text-[10px] text-[#555]">
                      s. {source.pageRange}
                    </span>
                  )}
                </div>

                {/* Excerpt */}
                <div
                  className={`text-xs font-mono leading-relaxed border-l-2 pl-2.5 ${
                    isActive
                      ? "text-[#888] border-accent/[0.2]"
                      : "text-[#666] border-white/[0.06]"
                  }`}
                >
                  {source.content.length > 300
                    ? source.content.substring(0, 300) + "…"
                    : source.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/sources-panel.tsx
git commit -m "feat: create SourcesPanel component with active source highlighting"
```

---

### Task 6: Create ChatInput component

**Files:**
- Create: `components/chat/chat-input.tsx`

Auto-growing textarea with suggested prompts. Enter sends, Shift+Enter adds newline.

- [ ] **Step 1: Create chat-input.tsx**

```tsx
"use client";

import { useRef, useCallback } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  suggestions?: string[];
}

export function ChatInput({ value, onChange, onSubmit, disabled, suggestions }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="px-5 py-4 border-t border-white/[0.06]">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Still et spørsmål om selskapet..."
          disabled={disabled}
          rows={1}
          className="flex-1 px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-md text-[13px] text-[#ccc] placeholder:text-[#444] resize-none outline-none focus:border-accent/[0.3] transition-colors disabled:opacity-40"
        />
        <button
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="w-9 h-9 flex items-center justify-center bg-accent/[0.12] border border-accent/[0.2] rounded-md text-accent hover:bg-accent/[0.2] hover:border-accent/[0.35] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <PaperPlaneRight size={16} weight="fill" />
        </button>
      </div>

      {suggestions && suggestions.length > 0 && !value && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestionClick(s)}
              className="text-[11px] px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded text-[#555] hover:bg-white/[0.05] hover:text-[#888] hover:border-white/[0.1] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/chat-input.tsx
git commit -m "feat: create ChatInput component with auto-grow and suggestions"
```

---

### Task 7: Create ChatWorkspace — the main split-pane component

**Files:**
- Create: `components/chat/chat-workspace.tsx`

This is the top-level component that replaces `chat-interface.tsx`. It manages all state: messages, streaming, sources, active source. Renders the split-pane layout with ChatHeader, MessageList (using Message), ChatInput, and SourcesPanel.

- [ ] **Step 1: Create chat-workspace.tsx**

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Message } from "./message";
import { SourcesPanel } from "./sources-panel";
import { ChatInput } from "./chat-input";
import type { SourceMeta } from "./cited-text";
import type { ChartConfig } from "./inline-chart";

interface ChatWorkspaceProps {
  companyId: Id<"companies">;
  sessionId: Id<"chatSessions">;
  companyName: string;
}

export function ChatWorkspace({ companyId, sessionId, companyName }: ChatWorkspaceProps) {
  const messages = useQuery(api.chatMessages.listBySession, { sessionId });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingSources, setStreamingSources] = useState<SourceMeta[]>([]);
  const [streamingChart, setStreamingChart] = useState<ChartConfig | null>(null);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(null);
  const [allSources, setAllSources] = useState<SourceMeta[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, activeSourceIndex]);

  // Collect all sources from all assistant messages + streaming
  useEffect(() => {
    const collected: SourceMeta[] = [];
    if (messages) {
      for (const msg of messages) {
        if (msg.role === "assistant" && msg.sources) {
          msg.sources.forEach((s: { chunkId: string; content: string; pageRange?: string }, i: number) => {
            if (!collected.find((c) => c.chunkId === s.chunkId)) {
              collected.push({
                index: collected.length + 1,
                chunkId: s.chunkId,
                content: s.content,
                pageRange: s.pageRange,
              });
            }
          });
        }
      }
    }
    // Add streaming sources that aren't already collected
    for (const s of streamingSources) {
      if (!collected.find((c) => c.chunkId === s.chunkId)) {
        collected.push({ ...s, index: collected.length + 1 });
      }
    }
    setAllSources(collected);
  }, [messages, streamingSources]);

  const handleCiteClick = useCallback((source: SourceMeta) => {
    setActiveSourceIndex((prev) => (prev === source.index ? null : source.index));
  }, []);

  const getSourcesForMessage = useCallback(
    (msg: { sources?: { chunkId: string; content: string; pageRange?: string }[] }): SourceMeta[] => {
      if (!msg.sources) return [];
      return msg.sources.map((s, i) => ({
        index: i + 1,
        chunkId: s.chunkId,
        content: s.content,
        pageRange: s.pageRange,
      }));
    },
    []
  );

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    setInput("");
    setIsLoading(true);
    setStreaming("");
    setStreamingSources([]);
    setStreamingChart(null);
    setActiveSourceIndex(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, companyId, sessionId }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.sources) setStreamingSources(parsed.sources);
            if (parsed.chart) setStreamingChart(parsed.chart);
            if (parsed.content) setStreaming((prev) => prev + parsed.content);
          } catch {}
        }
      }
    } finally {
      setStreaming("");
      setStreamingSources([]);
      setStreamingChart(null);
      setIsLoading(false);
      setActiveSourceIndex(null);
    }
  };

  const suggestions = [
    "Sammenlign med forrige kvartal",
    "Vis inntektsutvikling som graf",
    "Analyser gjeldssituasjonen",
  ];

  return (
    <div className="flex h-[calc(100vh-110px)]">
      {/* Left: Chat pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Terminal header */}
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2.5">
          <div className="w-[7px] h-[7px] rounded-full bg-accent" />
          <span className="font-mono text-[11px] tracking-[2px] uppercase text-accent">
            FinansAnalyse
          </span>
          <span className="text-white/[0.15] text-[11px]">/</span>
          <span className="text-[11px] text-[#666] tracking-wide">{companyName}</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {messages?.map((msg: { _id: string; role: string; content: string; sources?: { chunkId: string; content: string; pageRange?: string }[]; chart?: ChartConfig }) => (
            <Message
              key={msg._id}
              role={msg.role as "user" | "assistant"}
              content={msg.content}
              sources={getSourcesForMessage(msg)}
              chart={msg.chart}
              onCiteClick={handleCiteClick}
            />
          ))}

          {/* Streaming message */}
          {streaming && (
            <Message
              role="assistant"
              content={streaming}
              sources={streamingSources}
              chart={streamingChart ?? undefined}
              onCiteClick={handleCiteClick}
              isStreaming
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isLoading}
          suggestions={suggestions}
        />
      </div>

      {/* Right: Sources pane */}
      <SourcesPanel
        sources={allSources}
        activeSourceIndex={activeSourceIndex}
        onSourceClick={handleCiteClick}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/chat-workspace.tsx
git commit -m "feat: create ChatWorkspace split-pane layout with streaming"
```

---

### Task 8: Update chat API route with function calling for charts

**Files:**
- Modify: `app/api/chat/route.ts`

Add the `create_chart` tool to the OpenAI call. When GPT calls the tool, extract the chart config, include it in the SSE stream, then continue the conversation with the tool result so GPT can provide commentary.

- [ ] **Step 1: Add chart tool definition and modify the streaming logic**

Replace the entire `app/api/chat/route.ts` with the updated version. Key changes:
1. Add `CHART_TOOL` definition
2. Pass `tools` to the OpenAI call
3. Handle `tool_calls` in the stream — when GPT calls `create_chart`, emit a `chart` SSE event, then make a second call for the commentary
4. Persist chart data in the saved message

```typescript
import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getOpenAI } from "@/lib/openai";
import { generateEmbedding } from "@/lib/embeddings";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

interface FinancialMetric {
  period: string;
  category: string;
  metricName: string;
  value: number;
  unit: string;
}

interface ChunkResult {
  _id: string;
  content: string;
  pageRange?: string;
}

const CHART_TOOL = {
  type: "function" as const,
  function: {
    name: "create_chart",
    description:
      "Create an inline chart visualization for financial data. Use when the user asks for trends, comparisons, graphs, or visual representations of financial metrics.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bar", "line"],
          description: "Chart type. Use 'bar' for comparisons, 'line' for trends over time.",
        },
        title: {
          type: "string",
          description: "Chart title, e.g. 'Driftsinntekter (mrd NOK)'",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "X-axis labels, e.g. ['2020', '2021', '2022']",
        },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              values: { type: "array", items: { type: "number" } },
            },
            required: ["label", "values"],
          },
          description: "One or more data series",
        },
        unit: {
          type: "string",
          description: "Unit label for values, e.g. 'mrd NOK', '%'",
        },
      },
      required: ["type", "title", "labels", "datasets"],
    },
  },
};

function formatMetricsSummary(metrics: FinancialMetric[]): string {
  if (metrics.length === 0) return "";

  const byPeriod: Record<string, FinancialMetric[]> = {};
  for (const m of metrics) {
    if (!byPeriod[m.period]) byPeriod[m.period] = [];
    byPeriod[m.period].push(m);
  }

  const periods = Object.keys(byPeriod).sort();
  let summary = "## Ekstraherte nøkkeltall fra opplastede rapporter\n\n";

  for (const period of periods) {
    summary += `### ${period}\n`;
    const byCategory: Record<string, FinancialMetric[]> = {};
    for (const m of byPeriod[period]) {
      if (!byCategory[m.category]) byCategory[m.category] = [];
      byCategory[m.category].push(m);
    }
    for (const [category, items] of Object.entries(byCategory)) {
      summary += `**${category}:**\n`;
      for (const item of items) {
        const formatted =
          item.unit === "%"
            ? `${item.value}%`
            : `${item.value.toLocaleString("nb-NO")} ${item.unit}`;
        summary += `- ${item.metricName}: ${formatted}\n`;
      }
    }
    summary += "\n";
  }

  return summary;
}

async function buildSearchQuery(
  message: string,
  conversationHistory: { role: string; content: string }[]
): Promise<string> {
  if (conversationHistory.length === 0) return message;

  const recentMessages = conversationHistory.slice(-4);
  const context = recentMessages.map((m) => m.content).join(" ");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Omskriv brukerens spørsmål til et selvstendig søkespørsmål som kan brukes for å søke i finansrapporter. Inkluder spesifikke tall, årstall, selskap og temaer fra samtalehistorikken slik at spørsmålet gir mening uten kontekst. Returner KUN det omskrevne spørsmålet, ingen forklaring.`,
      },
      {
        role: "user",
        content: `Samtalehistorikk:\n${context}\n\nNytt spørsmål: ${message}`,
      },
    ],
    temperature: 0,
    max_tokens: 200,
  });

  return response.choices[0].message.content?.trim() || message;
}

export async function POST(req: NextRequest) {
  const token = await convexAuthNextjsToken();
  if (!token) {
    return new Response(JSON.stringify({ error: "Ikke autentisert" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(token);

  const { message, companyId, sessionId } = await req.json();

  const [existingMessages, allMetrics] = await Promise.all([
    convex.query(api.chatMessages.listBySession, { sessionId }),
    convex.query(api.financialMetrics.getByCompany, { companyId }),
  ]);

  const conversationHistory = existingMessages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  );

  const searchQuery = await buildSearchQuery(message, conversationHistory);
  const questionEmbedding = await generateEmbedding(searchQuery);

  const relevantChunks = await convex.action(api.chunks.search, {
    companyId,
    embedding: questionEmbedding,
    limit: 16,
  });

  const metricsSummary = formatMetricsSummary(allMetrics);

  const MAX_CONTEXT_CHARS = 60000;
  let contextChars = 0;
  const selectedChunks: ChunkResult[] = [];
  for (const chunk of relevantChunks) {
    if (contextChars + chunk.content.length > MAX_CONTEXT_CHARS) break;
    selectedChunks.push(chunk);
    contextChars += chunk.content.length;
  }

  const numberedContext = selectedChunks
    .map((chunk, i) => `[Kilde ${i + 1}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  await convex.mutation(api.chatMessages.create, {
    sessionId,
    role: "user",
    content: message,
  });

  const systemPrompt = `Du er en ekspert norsk finansanalytiker. Du har tilgang til to typer data:

1. NØKKELTALL: Strukturerte finansielle nøkkeltall ekstrahert fra rapportene (tall du kan bruke direkte til sammenligninger)
2. KILDER: Nummererte utdrag fra rapportteksten (for kvalitativ kontekst og detaljer)

Regler:
- Svar ALLTID på norsk
- Bruk KONKRETE tall — du har nøkkeltallene, bruk dem aktivt for sammenligninger og analyse
- Strukturer svaret tydelig med nummererte lister og **fet skrift** for overskrifter når du forklarer flere faktorer eller punkter
- Sett inn kildehenvisninger [1], [2] osv. INLINE når du bruker informasjon fra en kilde. Bruk ulike kildenummer for ulike fakta — ikke gjenta samme kilde for alt
- Formater tall med norsk format (komma som desimalskilletegn)
- Beregn endringer, vekstrater og marginer når det er relevant
- Aldri si "informasjonen er ikke tilgjengelig" hvis tallene finnes — sjekk BÅDE nøkkeltall og kilder
- Når brukeren ber om en graf, trend, eller visuell fremstilling, bruk create_chart-verktøyet med korrekte data fra nøkkeltallene/kildene. Gi ALLTID en tekstforklaring i tillegg til grafen.

${metricsSummary}
Kilder fra rapporter:
${numberedContext}`;

  const sourceMeta = selectedChunks.map((c, i) => ({
    index: i + 1,
    chunkId: c._id,
    content: c.content.substring(0, 1500),
    pageRange: c.pageRange,
  }));

  const encoder = new TextEncoder();
  let fullResponse = "";
  let chartData: {
    type: "bar" | "line";
    title: string;
    labels: string[];
    datasets: { label: string; values: number[] }[];
    unit?: string;
  } | null = null;

  const readableStream = new ReadableStream({
    async start(controller) {
      // Send sources first
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ sources: sourceMeta })}\n\n`)
      );

      const chatMessages: { role: string; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: message },
      ];

      // First call — may produce a tool call or direct content
      const stream = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        stream: true,
        messages: chatMessages as Parameters<typeof getOpenAI>["0"]["chat"]["completions"]["create"] extends (...args: infer A) => unknown ? never : { role: string; content: string }[] as never,
        tools: [CHART_TOOL],
      });

      let toolCallId = "";
      let toolCallArgs = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Accumulate tool call
        if (delta?.tool_calls?.[0]) {
          const tc = delta.tool_calls[0];
          if (tc.id) toolCallId = tc.id;
          if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
        }

        // Stream content
        const content = delta?.content || "";
        if (content) {
          fullResponse += content;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
          );
        }
      }

      // If tool was called, parse chart and get commentary
      if (toolCallId && toolCallArgs) {
        try {
          chartData = JSON.parse(toolCallArgs);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ chart: chartData })}\n\n`)
          );

          // Second call: provide tool result so GPT can give commentary
          const followUp = await getOpenAI().chat.completions.create({
            model: "gpt-4o",
            stream: true,
            messages: [
              ...chatMessages,
              {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: toolCallId,
                    type: "function",
                    function: {
                      name: "create_chart",
                      arguments: toolCallArgs,
                    },
                  },
                ],
              },
              {
                role: "tool",
                tool_call_id: toolCallId,
                content: `Grafen "${chartData!.title}" er opprettet og vist til brukeren. Gi nå en kort tekstlig analyse og forklaring av dataene i grafen. Bruk kildehenvisninger.`,
              },
            ] as never,
            tools: [CHART_TOOL],
          });

          for await (const chunk of followUp) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
          }
        } catch {
          // If chart parsing fails, continue without chart
        }
      }

      // Save assistant message with sources and chart
      await convex.mutation(api.chatMessages.create, {
        sessionId,
        role: "assistant",
        content: fullResponse,
        sources: selectedChunks.slice(0, 10).map((c) => ({
          chunkId: c._id as Id<"chunks">,
          content: c.content.substring(0, 1500),
          pageRange: c.pageRange,
        })),
        ...(chartData ? { chart: chartData } : {}),
      });

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add create_chart function calling to chat API route"
```

---

### Task 9: Update ChatTab and wire everything together

**Files:**
- Modify: `components/dashboard/chat-tab.tsx`
- Delete: `components/chat-interface.tsx`

Update ChatTab to pass company name to ChatWorkspace and remove the old chat-interface.

- [ ] **Step 1: Rewrite chat-tab.tsx**

```tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ChatWorkspace } from "../chat/chat-workspace";
import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

export function ChatTab({
  companyId,
  companyName,
}: {
  companyId: Id<"companies">;
  companyName: string;
}) {
  const sessions = useQuery(api.chatSessions.listByCompany, { companyId });
  const createSession = useMutation(api.chatSessions.create);
  const [activeSessionId, setActiveSessionId] = useState<Id<"chatSessions"> | null>(null);

  const handleNewSession = async () => {
    const id = await createSession({ companyId, title: "Ny samtale" });
    setActiveSessionId(id);
  };

  const activeSession = activeSessionId ?? sessions?.[0]?._id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto">
          {sessions &&
            sessions.length > 1 &&
            sessions.map((s: { _id: Id<"chatSessions">; title?: string }) => (
              <button
                key={s._id}
                onClick={() => setActiveSessionId(s._id)}
                className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors duration-150 ${
                  activeSession === s._id
                    ? "bg-accent/15 text-accent"
                    : "bg-elevated text-[#666666] hover:text-[#AAAAAA]"
                }`}
              >
                {s.title || "Samtale"}
              </button>
            ))}
        </div>
        <button
          onClick={handleNewSession}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-base rounded-lg hover:brightness-90 transition-all duration-150 font-medium"
        >
          <Plus size={14} weight="bold" />
          Ny samtale
        </button>
      </div>

      {activeSession ? (
        <ChatWorkspace
          companyId={companyId}
          sessionId={activeSession}
          companyName={companyName}
        />
      ) : (
        <div className="text-center py-16">
          <p className="text-[#666666]">Ingen samtaler enda</p>
          <button
            onClick={handleNewSession}
            className="mt-3 px-4 py-2 bg-accent text-base rounded-lg text-sm font-medium hover:brightness-90 transition-all duration-150"
          >
            Start en samtale
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update tabs.tsx to pass companyName**

In `components/dashboard/tabs.tsx`, the `ChatTab` now needs `companyName`. The parent `DashboardTabs` receives `companyId` but not the name. We need to query the company or pass the name down. The simplest approach: add `companyName` as a prop to `DashboardTabs`.

In `components/dashboard/tabs.tsx`, change the component signature and ChatTab usage:

```tsx
export function DashboardTabs({ companyId, companyName }: { companyId: Id<"companies">; companyName: string }) {
```

And update line 65:

```tsx
          {activeTab === "chat" && <ChatTab companyId={companyId} companyName={companyName} />}
```

- [ ] **Step 3: Update selskap/[id]/page.tsx to pass companyName**

In `app/selskap/[id]/page.tsx`, pass `companyName` to `DashboardTabs`:

Change line 57 from:
```tsx
        <DashboardTabs companyId={companyId} />
```
To:
```tsx
        <DashboardTabs companyId={companyId} companyName={company.name} />
```

- [ ] **Step 4: Delete old chat-interface.tsx**

```bash
rm components/chat-interface.tsx
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/chat-tab.tsx components/dashboard/tabs.tsx app/selskap/\[id\]/page.tsx
git rm components/chat-interface.tsx
git commit -m "feat: wire ChatWorkspace into dashboard, remove old chat-interface"
```

---

### Task 10: Build verification and type fixes

**Files:**
- All modified/created files

- [ ] **Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit`

Fix any type errors. Common issues to watch for:
- The OpenAI `messages` array type with `tool_calls` and `tool` roles needs `as never` casts due to strict SDK types
- The `chart` field on message objects from Convex queries — ensure the type aligns with `ChartConfig`

- [ ] **Step 2: Run the dev server**

Run: `npm run dev`

Verify:
- No build errors
- Navigate to a company page → Chat tab
- The split-pane layout renders (chat left, sources right)
- Terminal header shows with company name
- Messages render with left-border styling
- Input auto-grows and sends on Enter
- Suggested prompts appear when input is empty

- [ ] **Step 3: Test chat flow manually**

1. Send a text question → verify streaming works, sources populate right panel
2. Send "Vis inntektsutvikling som graf" → verify chart renders inline
3. Click a citation `[1]` → verify right panel highlights that source
4. Click a source chip → verify same highlighting behavior

- [ ] **Step 4: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: resolve type errors and build issues from chat redesign"
```

---

### Task 11: Clean up padding for full-height chat

**Files:**
- Modify: `components/dashboard/tabs.tsx`

The chat workspace is full-height but it's wrapped in `<div className="p-8 max-w-7xl mx-auto">` which adds padding and constrains width. For the chat tab specifically, we want the workspace to fill the available space.

- [ ] **Step 1: Conditionally remove padding wrapper for chat tab**

In `components/dashboard/tabs.tsx`, change the content rendering section:

```tsx
      <UploadProvider companyId={companyId}>
        {activeTab === "chat" ? (
          <div className="px-0">
            <ChatTab companyId={companyId} companyName={companyName} />
          </div>
        ) : (
          <div className="p-8 max-w-7xl mx-auto">
            {activeTab === "oversikt" && <OverviewTab companyId={companyId} />}
            {activeTab === "dokumenter" && <DocumentsTab companyId={companyId} />}
          </div>
        )}
      </UploadProvider>
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/tabs.tsx
git commit -m "fix: remove padding constraint for full-height chat workspace"
```
