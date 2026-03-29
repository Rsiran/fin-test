# Chat UX Redesign: Terminal + Research Workspace

## Summary

Redesign the financial chat interface from a basic chatbot bubble UI into a professional split-pane research workspace with terminal aesthetics, inline chart generation, and a persistent sources panel. The design merges Bloomberg-terminal data density with Perplexity-style evidence layout.

## Architecture

### Layout

- **Full viewport height** — replaces the current fixed `h-[600px]` container
- **Split-pane workspace**: chat pane (flex, fills remaining space) + sources pane (380px fixed width, right side)
- **Sources pane** is always visible when sources exist; shows an empty placeholder state when no citations are available
- **Terminal-style header bar** across the chat pane: `● FINANSANALYSE / Equinor ASA` — monospace font, teal status dot, company name from context

### Components

```
<ChatWorkspace>                    # Full-height split-pane container
  <ChatPane>                       # Left side
    <ChatHeader />                 # Terminal header bar
    <MessageList>                  # Scrollable message area
      <Message role="user" />      # Left-border teal, monospace label "DU"
      <Message role="assistant">   # Left-border gray, label "ANALYSE"
        <CitedText />              # Markdown with inline [N] citation buttons
        <InlineChart />            # Recharts chart block (when present)
        <SourceChips />            # Compact source tags below message
      </Message>
    </MessageList>
    <ChatInput>                    # Bottom input area
      <AutoGrowTextarea />         # Replaces single-line input
      <SuggestedPrompts />         # Contextual suggestions below input
    </ChatInput>
  </ChatPane>
  <SourcesPane>                    # Right side (380px)
    <SourcesHeader />              # "KILDER" + count badge
    <SourceCard />                 # Per-source: doc name, page range, excerpt
  </SourcesPane>
</ChatWorkspace>
```

## Message Design

### Terminal aesthetic

- **No bubbles** — messages use a left-border style:
  - User messages: `border-left: 2px solid rgba(45,212,191,0.35)` with subtle teal background
  - Assistant messages: `border-left: 2px solid rgba(255,255,255,0.08)` with near-transparent background
- **Monospace labels**: `DU` / `ANALYSE` — 9px uppercase, letter-spacing 1.5px, color #555
- **Financial number highlighting**: Values like `NOK 621,2 mrd` and `34,2%` rendered in teal (#2DD4BF) with monospace font
- **Max width**: 90% of pane width

### Citations

- **Inline buttons**: Small 16x16px squares with source index, monospace font, teal background. Clicking highlights the corresponding source card in the right panel.
- **Source chips**: Below each assistant message, separated by a subtle border-top. Format: `1 · s. 12-14`. Primary chip (active) uses teal; secondary chips use gray.

### Streaming

- **Blinking cursor**: 2px wide teal bar at the end of streaming text, 1s blink animation
- Existing SSE streaming approach is kept — no changes to the streaming protocol

## Inline Chart Generation

### Trigger mechanism

Use OpenAI function calling (tool use). Define a `create_chart` function that GPT-4o can call when the user's question warrants a visualization.

### Function definition

```json
{
  "name": "create_chart",
  "description": "Create an inline chart visualization for financial data. Use when the user asks for trends, comparisons, or visual representations of financial metrics.",
  "parameters": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "enum": ["bar", "line"],
        "description": "Chart type"
      },
      "title": {
        "type": "string",
        "description": "Chart title, e.g. 'Driftsinntekter (mrd NOK)'"
      },
      "labels": {
        "type": "array",
        "items": { "type": "string" },
        "description": "X-axis labels, e.g. ['2020', '2021', '2022']"
      },
      "datasets": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "label": { "type": "string" },
            "values": { "type": "array", "items": { "type": "number" } }
          },
          "required": ["label", "values"]
        },
        "description": "One or more data series"
      },
      "unit": {
        "type": "string",
        "description": "Unit label for values, e.g. 'mrd NOK', '%'"
      }
    },
    "required": ["type", "title", "labels", "datasets"]
  }
}
```

### Rendering

- **Library**: Recharts (already React-native, fits the stack)
- **Chart block**: Wrapped in a container with header (title + actions) and padded chart area
- **Actions**: "Tabell" button toggles between chart and data table view; "Eksporter" copies data as CSV
- **Styling**: Teal color palette matching the design system. Bar charts use varying opacity. Line charts use area fill with gradient.
- **Chart types for v1**: Bar chart, line chart with area fill. Future: stacked bar, grouped bar, comparison overlays.

### Data flow

1. User sends message asking for a visualization
2. Backend sends message to GPT-4o with `create_chart` in the tools array
3. If GPT calls the tool, backend extracts the chart config and includes it in the SSE stream as a `chart` event: `data: {"chart": {...config}}`
4. Frontend receives the chart event and renders it inline within the assistant message using Recharts
5. GPT also provides text commentary alongside the chart (before/after), which streams normally
6. Chart config is persisted in the `chatMessages` table alongside the message content

### Storage

Add an optional `chart` field to the `chatMessages` schema:

```typescript
chart: v.optional(v.object({
  type: v.union(v.literal("bar"), v.literal("line")),
  title: v.string(),
  labels: v.array(v.string()),
  datasets: v.array(v.object({
    label: v.string(),
    values: v.array(v.number()),
  })),
  unit: v.optional(v.string()),
}))
```

## Sources Panel

### Layout

- Fixed 380px width on the right side of the workspace
- Header: `KILDER` in monospace uppercase + count badge (e.g., "5 kilder")
- Scrollable list of source cards

### Source cards

- Document name, page range (monospace), excerpt text
- Excerpt styled with left-border (2px), monospace font, muted color
- **Active state**: When a citation `[N]` is clicked in the chat, the corresponding source card gets a teal border + brighter text, and the panel scrolls to it
- **Hover state**: Subtle background brightening

### Interaction

- Clicking a citation button in chat → highlights source card in right panel + scrolls into view
- Clicking a source card → could expand to show full excerpt (stretch goal)
- Source panel updates per-message: when a new assistant message arrives with sources, the panel shows those sources

## Input Area

- **Auto-growing textarea**: Starts as single line, grows up to ~4 lines, then scrolls internally
- **Send button**: 36x36px, teal background, arrow icon
- **Keyboard**: Enter sends, Shift+Enter inserts newline
- **Suggested prompts**: Row of small pill buttons below the input. Contextual suggestions that insert into the textarea on click. Examples: "Sammenlign med Aker BP", "Vis kontantstrøm-analyse", "Gjeldsbetjeningsevne"
- **Disabled state**: Input + button disabled while streaming

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `components/chat-interface.tsx` | **Rewrite** | Replace with ChatWorkspace split-pane component |
| `components/chat/message.tsx` | **Create** | Message component with terminal styling |
| `components/chat/sources-panel.tsx` | **Create** | Right-side sources pane |
| `components/chat/inline-chart.tsx` | **Create** | Recharts-based chart renderer |
| `components/chat/chat-input.tsx` | **Create** | Auto-grow textarea + suggestions |
| `components/chat/cited-text.tsx` | **Create** | Markdown + citation rendering (extracted from current) |
| `app/api/chat/route.ts` | **Modify** | Add create_chart tool to OpenAI call, stream chart events |
| `convex/schema.ts` | **Modify** | Add optional `chart` field to chatMessages |
| `convex/chatMessages.ts` | **Modify** | Handle chart data in create mutation |
| `package.json` | **Modify** | Add `recharts` dependency |

## Dependencies

- `recharts` — React charting library (add to package.json)
- No other new dependencies. Pretext (v0.0.3) skipped for v1.

## Out of Scope

- Message entrance animations/transitions
- Mobile responsive split-pane (collapse sources to overlay)
- Chart export to PNG
- Message regeneration / edit
- Markdown table rendering
- Dark/light theme toggle
- Chat session sidebar navigation
