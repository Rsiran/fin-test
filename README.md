# FinansAnalyse

A Norwegian financial report analysis platform. Upload PDF reports (annual reports, quarterly reports) for Norwegian-listed companies, get structured financial data extracted automatically, and ask questions about the reports using AI-powered chat.

## Features

- **PDF Processing** — Upload annual/quarterly reports, automatically converted to structured data using [opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf)
- **Financial Dashboard** — KPI cards, revenue/margin/cash flow charts, and period comparison tables auto-populated from uploaded reports
- **RAG Chat** — Ask questions about reports in Norwegian with inline source citations
- **Multi-company** — Analyze multiple companies independently
- **Batch Upload** — Drag-and-drop multiple PDFs at once

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, Recharts |
| Backend | Next.js API Routes, Convex |
| PDF Processing | opendataloader-pdf (Java) |
| AI | OpenAI GPT-4o (chat + extraction), text-embedding-3-small (embeddings) |
| Design | Dark theme, JetBrains Mono, Geist, Phosphor Icons |

## Prerequisites

- Node.js >= 20
- Java 11+ (for opendataloader-pdf)
- Convex account
- OpenAI API key

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Add your CONVEX_URL and OPENAI_API_KEY

# Start Convex (terminal 1)
npx convex dev

# Start Next.js (terminal 2)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Click **Legg til selskap** to add a company
2. Upload PDF reports on the **Dokumenter** tab
3. View extracted financial data on the **Oversikt** tab
4. Ask questions on the **Chat** tab

## Tests

```bash
npm test
```
