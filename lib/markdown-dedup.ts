interface Page {
  pageNumber: number;
  content: string;
}

const PAGE_MARKER_RE = /<!-- PAGE (\d+) -->/;

function splitByPages(markdown: string): Page[] {
  const parts = markdown.split(/---\n<!-- PAGE (\d+) -->\n/);
  if (parts.length < 3) {
    return [{ pageNumber: 0, content: markdown }];
  }

  const pages: Page[] = [];
  const preamble = parts[0].trim();
  if (preamble) {
    pages.push({ pageNumber: 0, content: preamble });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const pageNumber = parseInt(parts[i], 10);
    const content = parts[i + 1] ?? "";
    pages.push({ pageNumber, content });
  }

  return pages;
}

function normalizeLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((line) => setB.has(line)).length;
  return shared / Math.min(a.length, b.length);
}

function deduplicatePages(pages: Page[]): Page[] {
  const dominated = new Set<number>();

  for (let i = 0; i < pages.length; i++) {
    if (dominated.has(i)) continue;
    const linesI = normalizeLines(pages[i].content);

    for (let j = i + 1; j < pages.length; j++) {
      if (dominated.has(j)) continue;
      const linesJ = normalizeLines(pages[j].content);

      if (overlapRatio(linesI, linesJ) > 0.8) {
        if (linesI.length >= linesJ.length) {
          dominated.add(j);
        } else {
          dominated.add(i);
          break;
        }
      }
    }
  }

  return pages.filter((_, idx) => !dominated.has(idx));
}

type StatementType = "income_statement" | "balance_sheet" | "cash_flow" | null;

const CANONICAL_ORDER: StatementType[] = [
  "income_statement",
  "balance_sheet",
  "cash_flow",
];

const IS_KEYWORDS = [
  "driftsinntekter", "salgsinntekt", "varekostnad", "lønnskostnad",
  "driftsresultat", "ebitda", "finansinntekter", "finanskostnader",
  "resultat før skatt", "skattekostnad", "årsresultat", "periodens resultat",
  "revenue", "cost of goods", "gross profit", "operating profit",
  "earnings per share", "profit before tax", "income tax", "net income",
  "employee benefit", "personalkostnader", "andre driftskostnader",
  "other operating expense", "profit for the period",
];

const BS_KEYWORDS = [
  "eiendeler", "anleggsmidler", "omløpsmidler", "egenkapital",
  "gjeld", "goodwill", "varige driftsmidler", "kundefordringer",
  "leverandørgjeld", "sum eiendeler", "total assets", "total equity",
  "total liabilities", "inventories", "trade receivables",
  "share capital", "retained earnings", "cash and cash equivalents",
  "kontanter", "immaterielle eiendeler", "bruksrettseiendeler",
  "financial position", "balanse",
];

const CF_KEYWORDS = [
  "kontantstrøm fra", "driftsaktiviteter", "investeringsaktiviteter",
  "finansieringsaktiviteter", "netto endring", "operating activities",
  "investing activities", "financing activities", "net change in cash",
  "free cash flow", "cash generated", "kontantstrøm",
];

function classifyLine(line: string): StatementType {
  const lower = line.toLowerCase();
  if (IS_KEYWORDS.some((kw) => lower.includes(kw))) return "income_statement";
  if (BS_KEYWORDS.some((kw) => lower.includes(kw))) return "balance_sheet";
  if (CF_KEYWORDS.some((kw) => lower.includes(kw))) return "cash_flow";
  return null;
}

function deinterleavePage(content: string): string {
  const lines = content.split("\n");
  const classifications: (StatementType)[] = lines.map((l) => classifyLine(l));

  const types = new Set(classifications.filter((c) => c !== null));
  if (types.size < 2) return content;

  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  const classifiedCount = classifications.filter((c) => c !== null).length;
  if (nonEmptyLines.length > 0 && classifiedCount / nonEmptyLines.length < 0.6) {
    return content;
  }

  let lastClassification: StatementType = null;
  for (let i = 0; i < classifications.length; i++) {
    if (classifications[i] !== null) {
      lastClassification = classifications[i];
    } else if (lastClassification !== null && lines[i].trim().length > 0) {
      classifications[i] = lastClassification;
    }
  }

  const buckets: Record<string, string[]> = {
    income_statement: [],
    balance_sheet: [],
    cash_flow: [],
  };
  const unclassified: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cls = classifications[i];
    if (cls && buckets[cls]) {
      buckets[cls].push(lines[i]);
    } else {
      unclassified.push(lines[i]);
    }
  }

  const result: string[] = [];
  for (const type of CANONICAL_ORDER) {
    if (type && buckets[type].length > 0) {
      result.push(...buckets[type]);
    }
  }
  result.push(...unclassified);

  return result.join("\n");
}

function deinterleavePages(pages: Page[]): Page[] {
  return pages.map((page) => ({
    ...page,
    content: deinterleavePage(page.content),
  }));
}

function reassemble(pages: Page[]): string {
  return pages
    .map((p) =>
      p.pageNumber === 0
        ? p.content
        : `---\n<!-- PAGE ${p.pageNumber} -->\n${p.content}`
    )
    .join("");
}

export function deduplicateMarkdown(markdown: string): string {
  if (!PAGE_MARKER_RE.test(markdown)) {
    return markdown;
  }

  let pages = splitByPages(markdown);
  pages = deduplicatePages(pages);
  pages = deinterleavePages(pages);
  return reassemble(pages);
}
