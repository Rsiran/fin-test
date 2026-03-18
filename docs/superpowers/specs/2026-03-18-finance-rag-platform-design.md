# FinansAnalyse — Financial RAG Platform Design

## Overview

A client-facing web application for analyzing Norwegian-listed companies through their financial reports. Users upload PDFs (annual reports, quarterly reports, prospectuses, stock exchange announcements), which are automatically converted to structured data and made queryable via a RAG-powered chat interface. The UI is entirely in Norwegian.

## Architecture

**Approach C — Hybrid: Next.js API + Convex for State**

A single Oracle Cloud Free Tier ARM VM runs everything:

- **Next.js 15 (App Router)** — Norwegian UI + API routes for PDF upload and chat streaming
- **opendataloader-pdf** (Java subprocess) — converts PDFs to Markdown with preserved structure, tables, and reading order
- **Convex** — database, real-time subscriptions, file storage, and vector search
- **OpenAI API** — `text-embedding-3-small` for embeddings, `GPT-4o` for chat and financial data extraction

### Why this approach

- Full control over the processing pipeline in Next.js
- Convex handles what it's best at: real-time state, storage, vector search
- Single deployment keeps ops simple
- Streaming chat responses through Next.js API routes for polished UX
- Cannot deploy on Vercel (requires Java), Oracle Cloud Free Tier provides a powerful free VM

## Data Flow

### PDF Upload Pipeline

When a user uploads one or more PDFs, two parallel extraction paths run:

**Path 1 — RAG (for chat):**
PDF → opendataloader-pdf → Markdown → Chunk text → OpenAI embeddings → Store chunks + vectors in Convex

**Path 2 — Financial Data Extraction (for dashboard):**
PDF → opendataloader-pdf → Markdown → GPT-4o extracts structured JSON → Store in `financialMetrics` table

GPT-4o automatically identifies:
- The reporting period (Q1 2025, FY 2024, etc.)
- All key financial metrics tagged by category

### Chat Flow

User question → OpenAI embedding of question → Convex vector search (scoped to company) → Top-k relevant chunks + question → GPT-4o → Streamed response with source references

### Extracted Financial Metrics

**Resultat (Income Statement):**
- Driftsinntekter (Revenue)
- Driftsresultat (EBIT)
- EBITDA
- Resultat før skatt (Profit before tax)
- Årsresultat (Net income)
- Resultat per aksje (EPS)

**Balanse (Balance Sheet):**
- Sum eiendeler (Total assets)
- Egenkapital (Equity)
- Total gjeld (Total debt)
- Kontanter (Cash)
- Egenkapitalandel (Equity ratio)

**Kontantstrøm (Cash Flow):**
- Operasjonell kontantstrøm (Operating cash flow)
- Investeringsaktiviteter (CapEx)
- Finansieringsaktiviteter (Financing activities)
- Fri kontantstrøm (FCF)
- Netto endring i kontanter (Net change in cash)

**Marginer & Nøkkeltall (Margins & Key Ratios):**
- Driftsmargin (Operating margin)
- EBITDA-margin
- Netto margin
- ROE / ROA
- Gjeldsgrad (Debt ratio)

## Data Model (Convex)

### companies
| Field | Type | Description |
|-------|------|-------------|
| name | string | Company name (e.g., "Equinor ASA") |
| ticker | string? | Stock ticker (e.g., "EQNR") |
| description | string? | Optional description |
| createdAt | number | Timestamp |

### documents
| Field | Type | Description |
|-------|------|-------------|
| companyId | Id<"companies"> | Parent company |
| fileName | string | Original filename |
| fileId | Id<"_storage"> | Convex file storage reference |
| reportType | string | "årsrapport" \| "kvartalsrapport" \| "prospekt" \| "børsmelding" \| "annet" |
| period | string | "Q1 2025" \| "FY 2024" \| etc. |
| status | string | "processing" \| "ready" \| "error" |
| errorMessage | string? | Error details if status is "error" |
| markdownFileId | Id<"_storage"> | Converted markdown stored in Convex file storage (avoids 1MB document size limit for large reports) |
| createdAt | number | Timestamp |

### chunks
| Field | Type | Description |
|-------|------|-------------|
| documentId | Id<"documents"> | Parent document |
| companyId | Id<"companies"> | Denormalized for fast vector search scoping |
| content | string | Chunk text |
| embedding | float64[] | Vector embedding (1536 dims, Convex native format) |
| chunkIndex | number | Order within document |
| pageRange | string? | Source pages (e.g., "12-14") |

### financialMetrics
| Field | Type | Description |
|-------|------|-------------|
| documentId | Id<"documents"> | Source document |
| companyId | Id<"companies"> | Parent company |
| period | string | "Q1 2025" etc. |
| category | string | "resultat" \| "balanse" \| "kontantstrøm" \| "nøkkeltall" |
| metricName | string | "driftsinntekter" \| "ebitda" \| "fcf" etc. |
| value | number | Numeric value |
| unit | string | "NOK" \| "MNOK" \| "%" \| "x" |
| createdAt | number | Timestamp |

### chatSessions
| Field | Type | Description |
|-------|------|-------------|
| companyId | Id<"companies"> | Scoped to company |
| title | string? | Auto-generated or user-set |
| createdAt | number | Timestamp |

### chatMessages
| Field | Type | Description |
|-------|------|-------------|
| sessionId | Id<"chatSessions"> | Parent session |
| role | string | "user" \| "assistant" |
| content | string | Message text |
| sources | array? | References to chunks used |
| createdAt | number | Timestamp |

## Pages & Navigation

### Routes

- `/` — Home: list of companies + "Legg til selskap" button
- `/selskap/[id]` — Company dashboard with three tabs:
  - **Oversikt** — KPI cards with period-over-period changes, bar/line charts (revenue, EBITDA, cash flow, margins), comparison table, quick-chat bar
  - **Dokumenter** — uploaded reports list, batch drag-and-drop upload zone, report type/period metadata, delete option
  - **Chat** — full RAG chat interface with streaming responses, source citations, conversation history

### API Routes

- `POST /api/upload` — receives multiple PDFs, runs processing pipeline, returns progress
- `POST /api/chat` — streams GPT-4o responses with RAG context

All other data operations go through the Convex client directly (real-time subscriptions).

## User Flow

1. **Legg til selskap** — enter name and optional ticker
2. **Last opp rapporter** — drag-and-drop multiple PDFs (batch upload)
3. **Prosessering** — progress bar per file: PDF → Markdown → Chunks + Metrics
4. **Dashboard klart** — KPIs, charts, and comparison table auto-populate
5. **Still spørsmål** — chat with AI about the company's reports

## Dashboard Features

### KPI Cards
- Show latest period values for key metrics (revenue, EBITDA, FCF, operating margin)
- Period-over-period change indicators (▲/▼ with percentage)
- Color-coded (green for improvement, red for decline)

### Charts
- **Revenue bar chart** with toggle between bar/line view
- **Margins line chart** — overlays operating margin, EBITDA margin, net margin
- **Cash flow visualization** — operating, investing, financing activities with FCF
- All charts auto-populate from `financialMetrics` table when multiple reports exist

### Comparison Table
- All key metrics in rows, periods in columns
- Latest period highlighted
- Decline values shown in red

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, Recharts |
| Backend | Next.js API Routes, Convex |
| PDF Processing | opendataloader-pdf (Java, local mode) |
| AI | OpenAI GPT-4o (chat + extraction), text-embedding-3-small (embeddings) |
| Infrastructure | Oracle Cloud Free Tier (ARM VM, 4 CPU, 24GB RAM) |
| Reverse Proxy | Nginx |
| Language | Norwegian (bokmål) throughout UI |

## Key Design Decisions

1. **Flat `financialMetrics` table** — one row per metric per period. Makes chart queries trivial ("all driftsinntekter for company X, sorted by period").
2. **Denormalized `companyId` on chunks** — enables fast vector search scoped to a single company without joining through documents.
3. **Markdown stored in Convex file storage** — avoids 1MB document size limit; allows re-chunking or re-extracting without re-processing the PDF.
4. **opendataloader-pdf local mode** — no GPU needed, handles well-structured digital PDFs typical of Norwegian financial reports.
5. **Real-time processing with progress** — user waits with progress bar per file. Each file updates its `documents.status` field so the UI reflects progress via Convex subscriptions. On failure, status is set to "error" with an error message, and the user can retry individual files.
6. **Two API routes only** — upload and chat need server-side processing (Java subprocess, streaming). Everything else goes through Convex client.
7. **No auth initially** — ship the product first, add authentication later.
8. **Batch upload** — users can drag-and-drop multiple PDFs at once, each processed with its own progress indicator.

## Chunking Strategy

- **Chunk size:** ~1000 tokens with ~200 token overlap
- **Method:** Split on markdown headings (h1, h2, h3) first to preserve section boundaries. Within large sections, split on paragraph boundaries. Never split mid-table — tables are kept as whole chunks.
- **Metadata per chunk:** document ID, company ID, chunk index, source page range (extracted from opendataloader-pdf's bounding box data)

## Financial Data Extraction

GPT-4o receives the full markdown of each report with a structured extraction prompt that:
1. Identifies the reporting period and canonicalizes it (see Period Format below)
2. Extracts all available metrics from the predefined list, returning JSON
3. Reports confidence level per metric (high/medium/low)

**Validation:** Extracted values are sanity-checked before storage — reject negative revenue, margins outside -100% to 100%, etc. Low-confidence extractions are flagged for user review on the dashboard.

## Period Format

All periods are canonicalized to a standard format for consistent sorting and comparison:
- Quarterly: `YYYY-QN` (e.g., `2025-Q1`, `2025-Q3`)
- Annual: `YYYY-FY` (e.g., `2024-FY`)
- Half-year: `YYYY-H1`, `YYYY-H2`

GPT-4o maps Norwegian terms ("første kvartal 2025", "årsrapport 2024", "halvårsrapport") to this canonical format during extraction.

## Error Handling

- **PDF conversion failure:** Document status set to "error" with message. User can retry or delete.
- **OpenAI rate limits:** Exponential backoff with 3 retries. If batch upload hits limits, files are queued and processed sequentially.
- **Extraction failure:** If GPT-4o returns invalid JSON or fails, RAG path still completes (chat works), but dashboard metrics are marked as "extraction failed" — user can trigger re-extraction.
- **Partial upload:** Each file in a batch is independent. One failure doesn't block others.

## External Dependencies

- **opendataloader-pdf** — `https://github.com/opendataloader-project/opendataloader-pdf.git` (Apache 2.0). Installed via npm (`@opendataloader/pdf`) or pip. Requires Java 11+ on the system.
- **Convex** — managed backend service (free tier available)
- **OpenAI API** — pay-per-use for embeddings and chat completions
- **Oracle Cloud Free Tier** — always-free ARM VM for hosting
