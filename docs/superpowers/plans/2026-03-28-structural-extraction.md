# Structural Extraction Pre-processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current keyword-scored section extraction with a structural table-aware pipeline that deterministically selects financial statement tables, resolves units per-table, and feeds a clean, small payload to the LLM.

**Architecture:** Three new modules (table-parser, table-classifier, unit-resolver) slot into the existing extraction pipeline in `lib/financial-extractor.ts`, replacing `extractFinancialSections()`. The LLM prompt is simplified to only handle column selection and metric name mapping. Period format normalization is also fixed.

**Tech Stack:** TypeScript, Vitest for tests, GPT-4o for extraction (unchanged)

**Spec:** `docs/superpowers/specs/2026-03-28-structural-extraction-design.md`

---

### Task 1: Fix period format canonicalization

**Files:**
- Modify: `lib/period-format.ts`
- Modify: `__tests__/period-format.test.ts`

- [ ] **Step 1: Add failing tests for missing period formats**

Add to `__tests__/period-format.test.ts`:

```typescript
// Add these test cases to the existing describe block for canonicalizePeriod
it("handles digit-Q-year format (1Q 2025)", () => {
  expect(canonicalizePeriod("1Q 2025")).toBe("2025-Q1");
  expect(canonicalizePeriod("4Q 2025")).toBe("2025-Q4");
  expect(canonicalizePeriod("2Q2024")).toBe("2024-Q2");
});

it("handles 6M format", () => {
  expect(canonicalizePeriod("6M 2024")).toBe("2024-H1");
  expect(canonicalizePeriod("6m2025")).toBe("2025-H1");
});

it("handles 12M format", () => {
  expect(canonicalizePeriod("12M 2024")).toBe("2024-FY");
  expect(canonicalizePeriod("12m 2023")).toBe("2023-FY");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: 3 new tests FAIL

- [ ] **Step 3: Add new patterns to canonicalizePeriod**

In `lib/period-format.ts`, add these patterns right after the existing `qMatch` block (line 10):

```typescript
  // "1Q 2025", "4Q2025" → "2025-Q1", "2025-Q4"
  const nqMatch = s.match(/(\d)q\s*(\d{4})/);
  if (nqMatch) return `${nqMatch[2]}-Q${nqMatch[1]}`;
```

And add before the `fyMatch` block (line 27):

```typescript
  // "12M 2024" → "2024-FY" (must come before 6M check)
  const twelveMMatch = s.match(/12m\s*(\d{4})/);
  if (twelveMMatch) return `${twelveMMatch[1]}-FY`;

  // "6M 2024" → "2024-H1"
  const sixMMatch = s.match(/6m\s*(\d{4})/);
  if (sixMMatch) return `${sixMMatch[1]}-H1`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/period-format.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/period-format.ts __tests__/period-format.test.ts
git commit -m "fix: add 1Q/6M/12M patterns to canonicalizePeriod"
```

---

### Task 2: Build markdown table parser

**Files:**
- Create: `lib/table-parser.ts`
- Create: `__tests__/table-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/table-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseMarkdownTables, type ParsedTable } from "../lib/table-parser";

const INCOME_STATEMENT_MD = `
## Income statement

|Statement of profit or loss (NOK 1000)|Q4 2025|Q4 2024|12M 2025|12M 2024|Notes|
|---|---|---|---|---|---|
|Revenue|606 077|684 809|2 677 042|2 717 702| |
|EBITDA|228 315|300 178|1 142 790|1 169 899| |
|Operating result (EBIT)|(60 451)|79 865|149 431|363 756| |
`;

const KEY_FIGURES_MD = `
## Key figures

| |4Q 2023|4Q 2022|12M 2023|12M 2022|
|---|---|---|---|---|
|Revenue (NOKm)|474|327|1 996|1 163|
|EBIT (NOKm)|80|35|332|105|
|Equity (NOKm)|928|579|928|579|
`;

const MALFORMED_BR_MD = `
#### Balance Sheet

|Statement of financial position (NOK 1000)|31.12.2025|31.12.2024|Notes|
|---|---|---|---|
|Property|562 451|298 598|3|
|Total non-current assets<br><br>Current assets Bunkers|2 362 707<br><br>11 265|2 234 649<br><br>18 768| |
|Total assets|3 605 794|3 247 702| |
`;

describe("parseMarkdownTables", () => {
  it("parses a standard financial table", () => {
    const tables = parseMarkdownTables(INCOME_STATEMENT_MD);
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t.heading).toBe("Income statement");
    expect(t.headerRow).toContain("Q4 2025");
    expect(t.unitIndicator).toBe("NOK 1000");
    expect(t.detectedUnit).toBe("thousands");
    const ebitda = t.rows.find((r) => r.label.includes("EBITDA"));
    expect(ebitda).toBeDefined();
    expect(ebitda!.values[0]).toBe("228 315");
  });

  it("extracts unit from row-level NOKm indicators", () => {
    const tables = parseMarkdownTables(KEY_FIGURES_MD);
    expect(tables).toHaveLength(1);
    expect(tables[0].unitIndicator).toBe("NOKm");
    expect(tables[0].detectedUnit).toBe("millions");
  });

  it("handles malformed <br> rows by splitting into separate rows", () => {
    const tables = parseMarkdownTables(MALFORMED_BR_MD);
    expect(tables).toHaveLength(1);
    const t = tables[0];
    // The <br> row should be split into two rows
    const totalNonCurrent = t.rows.find((r) =>
      r.label.includes("Total non-current assets")
    );
    expect(totalNonCurrent).toBeDefined();
    expect(totalNonCurrent!.values[0]).toBe("2 362 707");
    const bunkers = t.rows.find((r) => r.label.includes("Bunkers"));
    expect(bunkers).toBeDefined();
    expect(bunkers!.values[0]).toBe("11 265");
  });

  it("captures line number", () => {
    const tables = parseMarkdownTables(INCOME_STATEMENT_MD);
    expect(tables[0].lineNumber).toBeGreaterThan(0);
  });

  it("returns empty array for text with no tables", () => {
    expect(parseMarkdownTables("Just some text\nNo tables here")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/table-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement table parser**

Create `lib/table-parser.ts`:

```typescript
export interface ParsedTable {
  heading: string;
  headerRow: string[];
  rows: { label: string; values: string[] }[];
  rawText: string;
  lineNumber: number;
  unitIndicator: string | null;
  detectedUnit: "thousands" | "millions" | "billions" | "whole" | null;
}

const THOUSANDS_PATTERNS = [
  /\bTNOK\b/i, /\bTEUR\b/i, /\bTSEK\b/i, /\bTDKK\b/i, /\bTUSD\b/i, /\bTGBP\b/i,
  /NOK\s*1\s*000/i, /EUR\s*1\s*000/i, /USD\s*1\s*000/i,
  /['']000/i, /\(000s?\)/i,
  /\(tusen\)/i, /\(thousands\)/i, /in thousands/i,
  /amounts in thousands/i, /beløp i tusen/i,
  /tall i tusen/i, /figures in thousands/i,
  /T€/, /T\$/, /\bTkr\b/i,
];

const MILLIONS_PATTERNS = [
  /\bMNOK\b/i, /\bMEUR\b/i, /\bMSEK\b/i, /\bMDKK\b/i, /\bMUSD\b/i, /\bMGBP\b/i,
  /\(NOKm\)/i, /\(EURm\)/i, /\(USDm\)/i,
  /\bNOKm\b/i, /\bEURm\b/i, /\bUSDm\b/i,
  /\bmill\.\s*(kr|NOK|EUR|USD|SEK|DKK|GBP)?/i,
  /\bmKR\b/i,
  /amounts in millions/i, /beløp i millioner/i,
  /figures in millions/i,
  /M€/, /M\$/, /\bMkr\b/i,
];

const BILLIONS_PATTERNS = [
  /\bmrd\.\s*(kr)?/i, /\bmilliarder\b/i,
  /\bBNOK\b/i, /\bBEUR\b/i, /\bBUSD\b/i,
  /\(NOKbn\)/i, /\bbillions\b/i,
];

function detectUnit(text: string): { indicator: string | null; unit: ParsedTable["detectedUnit"] } {
  for (const pat of THOUSANDS_PATTERNS) {
    const m = text.match(pat);
    if (m) return { indicator: m[0], unit: "thousands" };
  }
  for (const pat of MILLIONS_PATTERNS) {
    const m = text.match(pat);
    if (m) return { indicator: m[0], unit: "millions" };
  }
  for (const pat of BILLIONS_PATTERNS) {
    const m = text.match(pat);
    if (m) return { indicator: m[0], unit: "billions" };
  }
  return { indicator: null, unit: null };
}

function findHeading(lines: string[], tableStartLine: number): string {
  for (let i = tableStartLine - 1; i >= 0; i--) {
    const match = lines[i].match(/^#{1,6}\s+(.+)/);
    if (match) return match[1].trim();
  }
  return "";
}

function parseTableRow(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1) // remove leading/trailing empty from |...|
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s:?-]+(\|[\s:?-]+)+\|$/.test(line.trim());
}

function expandBrRows(
  label: string,
  values: string[]
): { label: string; values: string[] }[] {
  if (!label.includes("<br>") && !values.some((v) => v.includes("<br>"))) {
    return [{ label, values }];
  }
  const cleanBr = (s: string) => s.replace(/<br\s*\/?>/gi, "\n");
  const labelParts = cleanBr(label).split("\n").map((s) => s.trim()).filter(Boolean);
  const valueParts = values.map((v) =>
    cleanBr(v).split("\n").map((s) => s.trim()).filter(Boolean)
  );
  const maxParts = Math.max(labelParts.length, ...valueParts.map((v) => v.length));
  const result: { label: string; values: string[] }[] = [];
  for (let i = 0; i < maxParts; i++) {
    result.push({
      label: labelParts[i] ?? "",
      values: valueParts.map((vp) => vp[i] ?? ""),
    });
  }
  return result.filter((r) => r.label || r.values.some(Boolean));
}

export function parseMarkdownTables(markdown: string): ParsedTable[] {
  const lines = markdown.split("\n");
  const tables: ParsedTable[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for a table: a line starting with | followed by a separator row
    if (line.startsWith("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1].trim())) {
      const tableStartLine = i;
      const headerCells = parseTableRow(line);

      // Skip separator
      i += 2;

      // Collect data rows
      const rows: { label: string; values: string[] }[] = [];
      const rawLines = [lines[tableStartLine], lines[tableStartLine + 1]];

      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rawLines.push(lines[i]);
        const cells = parseTableRow(lines[i]);
        if (cells.length >= 2) {
          const label = cells[0];
          const values = cells.slice(1);
          // Expand <br> merged rows
          const expanded = expandBrRows(label, values);
          rows.push(...expanded);
        }
        i++;
      }

      const heading = findHeading(lines, tableStartLine);
      // Detect unit from header row first cell (e.g. "Statement of profit or loss (NOK 1000)")
      // then from heading, then from row labels
      const headerText = headerCells.join(" ") + " " + heading;
      let { indicator, unit } = detectUnit(headerText);

      // If not found in header, check row labels for per-row units like "(NOKm)"
      if (!indicator) {
        const allLabels = rows.map((r) => r.label).join(" ");
        ({ indicator, unit } = detectUnit(allLabels));
      }

      tables.push({
        heading,
        headerRow: headerCells,
        rows,
        rawText: rawLines.join("\n"),
        lineNumber: tableStartLine + 1, // 1-indexed
        unitIndicator: indicator,
        detectedUnit: unit,
      });
    } else {
      i++;
    }
  }

  return tables;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/table-parser.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/table-parser.ts __tests__/table-parser.test.ts
git commit -m "feat: add markdown table parser with unit detection"
```

---

### Task 3: Build table classifier

**Files:**
- Create: `lib/table-classifier.ts`
- Create: `__tests__/table-classifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/table-classifier.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyTable, type TableClass } from "../lib/table-classifier";
import { type ParsedTable } from "../lib/table-parser";

function makeTable(overrides: Partial<ParsedTable>): ParsedTable {
  return {
    heading: "",
    headerRow: [],
    rows: [],
    rawText: "",
    lineNumber: 0,
    unitIndicator: null,
    detectedUnit: null,
    ...overrides,
  };
}

describe("classifyTable", () => {
  it("classifies income statement by heading", () => {
    expect(
      classifyTable(makeTable({ heading: "Income statement" }))
    ).toBe("income_statement");
  });

  it("classifies income statement by header cell", () => {
    expect(
      classifyTable(
        makeTable({
          headerRow: ["Statement of profit or loss (NOK 1000)", "Q4 2025", "Q4 2024"],
        })
      )
    ).toBe("income_statement");
  });

  it("classifies balance sheet by heading", () => {
    expect(
      classifyTable(makeTable({ heading: "Balance Sheet" }))
    ).toBe("balance_sheet");
  });

  it("classifies balance sheet by row labels", () => {
    expect(
      classifyTable(
        makeTable({
          heading: "Financial Statements",
          rows: [
            { label: "Non-current assets", values: ["100"] },
            { label: "Total assets", values: ["500"] },
            { label: "Total equity", values: ["200"] },
          ],
        })
      )
    ).toBe("balance_sheet");
  });

  it("classifies cash flow by heading", () => {
    expect(
      classifyTable(makeTable({ heading: "Cash flow statement" }))
    ).toBe("cash_flow");
  });

  it("classifies Norwegian kontantstrøm", () => {
    expect(
      classifyTable(makeTable({ heading: "Kontantstrømoppstilling" }))
    ).toBe("cash_flow");
  });

  it("classifies key figures summary", () => {
    expect(
      classifyTable(makeTable({ heading: "Key figures" }))
    ).toBe("key_figures_summary");
  });

  it("classifies nøkkeltall/hovedtall as summary", () => {
    expect(
      classifyTable(makeTable({ heading: "Nøkkeltall konsern" }))
    ).toBe("key_figures_summary");
  });

  it("classifies highlights as summary", () => {
    expect(
      classifyTable(makeTable({ heading: "Highlights" }))
    ).toBe("key_figures_summary");
  });

  it("classifies notes", () => {
    expect(
      classifyTable(makeTable({ heading: "Note 5 - Revenue" }))
    ).toBe("notes");
  });

  it("classifies unknown tables as other", () => {
    expect(
      classifyTable(makeTable({ heading: "Board of Directors" }))
    ).toBe("other");
  });

  it("financial statement beats key_figures_summary on conflict", () => {
    // A table under "Key figures" heading but with income statement structure
    expect(
      classifyTable(
        makeTable({
          heading: "Key figures",
          headerRow: ["Statement of profit or loss (NOK 1000)", "Q4"],
        })
      )
    ).toBe("income_statement");
  });

  it("classifies Norwegian resultatregnskap", () => {
    expect(
      classifyTable(makeTable({ heading: "Resultatregnskap" }))
    ).toBe("income_statement");
  });

  it("classifies statement of financial position", () => {
    expect(
      classifyTable(
        makeTable({
          headerRow: ["Statement of financial position (NOK 1000)", "31.12.2025"],
        })
      )
    ).toBe("balance_sheet");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/table-classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement table classifier**

Create `lib/table-classifier.ts`:

```typescript
import { type ParsedTable } from "./table-parser";

export type TableClass =
  | "income_statement"
  | "balance_sheet"
  | "cash_flow"
  | "key_figures_summary"
  | "notes"
  | "other";

const INCOME_HEADING = [
  "profit or loss", "resultatregnskap", "income statement",
  "comprehensive income", "profit and loss",
];

const INCOME_ROWS = [
  "ebitda", "operating result", "driftsresultat", "driftsresultat",
  "operating profit", "driftsresultat (ebit)",
];

const BALANCE_HEADING = [
  "financial position", "balanse", "balance sheet",
];

const BALANCE_ROWS = [
  "total assets", "sum eiendeler", "total equity", "egenkapital",
  "total equity and liabilities",
];

const CASHFLOW_HEADING = [
  "cash flow", "kontantstrøm", "kontantstrømoppstilling",
];

const CASHFLOW_ROWS = [
  "operating activities", "operasjonelle aktiviteter",
  "investeringsaktiviteter", "investing activities",
  "cash generated", "kontantstrøm fra drift",
];

const SUMMARY_HEADING = [
  "key figures", "nøkkeltall", "highlights", "hovedtall",
  "financial highlights",
];

const NOTES_HEADING = [
  "note ", "noter", "notes to",
];

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export function classifyTable(table: ParsedTable): TableClass {
  const headingAndHeader = (
    table.heading + " " + table.headerRow.join(" ")
  );
  const rowLabels = table.rows.map((r) => r.label).join(" ");
  const allText = headingAndHeader + " " + rowLabels;

  // Check financial statement types first (they take priority)
  if (matchesAny(headingAndHeader, INCOME_HEADING)) return "income_statement";
  if (matchesAny(headingAndHeader, BALANCE_HEADING)) return "balance_sheet";
  if (matchesAny(headingAndHeader, CASHFLOW_HEADING)) return "cash_flow";

  // Check row labels for financial statement signals
  if (matchesAny(rowLabels, INCOME_ROWS)) return "income_statement";
  if (matchesAny(rowLabels, BALANCE_ROWS)) return "balance_sheet";
  if (matchesAny(rowLabels, CASHFLOW_ROWS)) return "cash_flow";

  // Lower priority: summaries and notes
  if (matchesAny(headingAndHeader, SUMMARY_HEADING)) return "key_figures_summary";
  if (matchesAny(headingAndHeader, NOTES_HEADING)) return "notes";

  return "other";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/table-classifier.test.ts`
Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/table-classifier.ts __tests__/table-classifier.test.ts
git commit -m "feat: add deterministic table classifier"
```

---

### Task 4: Build unit resolver

**Files:**
- Create: `lib/unit-resolver.ts`
- Create: `__tests__/unit-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/unit-resolver.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveUnits } from "../lib/unit-resolver";
import { type ParsedTable } from "../lib/table-parser";
import { type TableClass } from "../lib/table-classifier";

interface ClassifiedTable {
  table: ParsedTable;
  classification: TableClass;
}

function makeClassified(
  classification: TableClass,
  overrides: Partial<ParsedTable>
): ClassifiedTable {
  return {
    classification,
    table: {
      heading: "",
      headerRow: [],
      rows: [],
      rawText: "",
      lineNumber: 0,
      unitIndicator: null,
      detectedUnit: null,
      ...overrides,
    },
  };
}

describe("resolveUnits", () => {
  it("uses each table's own detected unit", () => {
    const tables = [
      makeClassified("income_statement", { detectedUnit: "thousands", unitIndicator: "NOK 1000" }),
      makeClassified("balance_sheet", { detectedUnit: "thousands", unitIndicator: "NOK 1000" }),
    ];
    const resolved = resolveUnits(tables);
    expect(resolved[0].resolvedUnit).toBe("thousands");
    expect(resolved[1].resolvedUnit).toBe("thousands");
  });

  it("falls back to cross-table consistency when a table has no unit", () => {
    const tables = [
      makeClassified("income_statement", { detectedUnit: "thousands", unitIndicator: "NOK 1000" }),
      makeClassified("balance_sheet", { detectedUnit: null, unitIndicator: null }),
    ];
    const resolved = resolveUnits(tables);
    expect(resolved[0].resolvedUnit).toBe("thousands");
    expect(resolved[1].resolvedUnit).toBe("thousands");
  });

  it("does not override an explicit unit with cross-table fallback", () => {
    const tables = [
      makeClassified("income_statement", { detectedUnit: "thousands", unitIndicator: "NOK 1000" }),
      makeClassified("balance_sheet", { detectedUnit: "millions", unitIndicator: "MNOK" }),
    ];
    const resolved = resolveUnits(tables);
    expect(resolved[0].resolvedUnit).toBe("thousands");
    expect(resolved[1].resolvedUnit).toBe("millions");
  });

  it("returns null when no unit can be resolved", () => {
    const tables = [
      makeClassified("income_statement", { detectedUnit: null, unitIndicator: null }),
    ];
    const resolved = resolveUnits(tables);
    expect(resolved[0].resolvedUnit).toBeNull();
  });

  it("generates correct unit context string", () => {
    const tables = [
      makeClassified("income_statement", {
        detectedUnit: "thousands",
        unitIndicator: "NOK 1000",
        headerRow: ["Statement of profit or loss (NOK 1000)", "Q4 2025"],
      }),
    ];
    const resolved = resolveUnits(tables);
    expect(resolved[0].unitContext).toContain("thousands");
    expect(resolved[0].unitContext).toContain("divide");
    expect(resolved[0].unitContext).toContain("1000");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/unit-resolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement unit resolver**

Create `lib/unit-resolver.ts`:

```typescript
import { type ParsedTable } from "./table-parser";
import { type TableClass } from "./table-classifier";

interface ClassifiedTable {
  table: ParsedTable;
  classification: TableClass;
}

export interface ResolvedTable extends ClassifiedTable {
  resolvedUnit: ParsedTable["detectedUnit"];
  unitContext: string;
}

const UNIT_CONTEXT: Record<string, string> = {
  thousands: "Values are in thousands. Divide by 1000 to get millions.",
  millions: "Values are already in millions. Use as-is.",
  billions: "Values are in billions. Multiply by 1000 to get millions.",
  whole: "Values are in whole currency units. Divide by 1000000 to get millions.",
};

export function resolveUnits(tables: ClassifiedTable[]): ResolvedTable[] {
  // Find the first financial statement table with an explicit unit
  const financialTypes: TableClass[] = ["income_statement", "balance_sheet", "cash_flow"];
  const referenceUnit = tables
    .filter((t) => financialTypes.includes(t.classification) && t.table.detectedUnit)
    .map((t) => t.table.detectedUnit)[0] ?? null;

  return tables.map((ct) => {
    // Use the table's own unit if it has one, otherwise fall back to reference
    const resolvedUnit = ct.table.detectedUnit ?? referenceUnit;
    const unitContext = resolvedUnit
      ? UNIT_CONTEXT[resolvedUnit] ?? ""
      : "No unit detected. Infer from value magnitudes.";

    return { ...ct, resolvedUnit, unitContext };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/unit-resolver.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/unit-resolver.ts __tests__/unit-resolver.test.ts
git commit -m "feat: add per-table unit resolver with cross-table fallback"
```

---

### Task 5: Build structured LLM input formatter

**Files:**
- Create: `lib/structured-input.ts`
- Create: `__tests__/structured-input.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/structured-input.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildStructuredInput } from "../lib/structured-input";
import { type ResolvedTable } from "../lib/unit-resolver";
import { type ParsedTable } from "../lib/table-parser";

function makeResolved(
  classification: "income_statement" | "balance_sheet" | "cash_flow" | "key_figures_summary" | "notes" | "other",
  resolvedUnit: ParsedTable["detectedUnit"],
  heading: string,
  headerRow: string[],
  rows: { label: string; values: string[] }[]
): ResolvedTable {
  return {
    classification,
    resolvedUnit,
    unitContext: resolvedUnit === "thousands" ? "Values are in thousands. Divide by 1000 to get millions." : "",
    table: {
      heading,
      headerRow,
      rows,
      rawText: "",
      lineNumber: 0,
      unitIndicator: null,
      detectedUnit: resolvedUnit,
    },
  };
}

describe("buildStructuredInput", () => {
  it("includes only financial statement tables", () => {
    const tables: ResolvedTable[] = [
      makeResolved("key_figures_summary", "millions", "Key figures", ["", "Q4"], [
        { label: "Revenue (NOKm)", values: ["474"] },
      ]),
      makeResolved("income_statement", "thousands", "Income statement", ["(NOK 1000)", "Q4 2025"], [
        { label: "Revenue", values: ["606 077"] },
        { label: "EBITDA", values: ["228 315"] },
      ]),
    ];
    const input = buildStructuredInput(tables);
    expect(input).toContain("INCOME STATEMENT");
    expect(input).toContain("228 315");
    expect(input).not.toContain("Key figures");
    expect(input).not.toContain("474");
  });

  it("includes unit context per table", () => {
    const tables: ResolvedTable[] = [
      makeResolved("income_statement", "thousands", "Income", ["(NOK 1000)", "Q4"], [
        { label: "Revenue", values: ["606 077"] },
      ]),
    ];
    const input = buildStructuredInput(tables);
    expect(input).toContain("thousands");
    expect(input).toContain("divide");
  });

  it("includes all three financial statement types", () => {
    const tables: ResolvedTable[] = [
      makeResolved("income_statement", "thousands", "Income", ["", "Q4"], []),
      makeResolved("balance_sheet", "thousands", "Balance", ["", "31.12"], []),
      makeResolved("cash_flow", "thousands", "Cash flow", ["", "Q4"], []),
    ];
    const input = buildStructuredInput(tables);
    expect(input).toContain("INCOME STATEMENT");
    expect(input).toContain("BALANCE SHEET");
    expect(input).toContain("CASH FLOW");
  });

  it("returns empty string when no financial tables found", () => {
    const tables: ResolvedTable[] = [
      makeResolved("key_figures_summary", "millions", "Key figures", [], []),
    ];
    expect(buildStructuredInput(tables)).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/structured-input.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement structured input builder**

Create `lib/structured-input.ts`:

```typescript
import { type ResolvedTable } from "./unit-resolver";

const LABEL_MAP: Record<string, string> = {
  income_statement: "INCOME STATEMENT",
  balance_sheet: "BALANCE SHEET",
  cash_flow: "CASH FLOW",
};

const FINANCIAL_TYPES = new Set(["income_statement", "balance_sheet", "cash_flow"]);

export function buildStructuredInput(tables: ResolvedTable[]): string {
  const financialTables = tables.filter((t) => FINANCIAL_TYPES.has(t.classification));
  if (financialTables.length === 0) return "";

  const sections: string[] = [];

  for (const rt of financialTables) {
    const label = LABEL_MAP[rt.classification] ?? rt.classification.toUpperCase();
    const columns = rt.table.headerRow.slice(1).join(" | "); // skip first cell (label column)
    const unitLine = rt.unitContext ? ` (${rt.unitContext})` : "";

    const lines: string[] = [];
    lines.push(`${label}${unitLine}`);
    if (columns) lines.push(`Columns: ${columns}`);

    for (const row of rt.table.rows) {
      if (row.label) {
        lines.push(`|${row.label}|${row.values.join("|")}|`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/structured-input.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/structured-input.ts __tests__/structured-input.test.ts
git commit -m "feat: add structured input builder for LLM extraction"
```

---

### Task 6: Integrate pipeline and update LLM prompt

**Files:**
- Modify: `lib/financial-extractor.ts`
- Modify: `__tests__/financial-extractor.test.ts`

- [ ] **Step 1: Write integration test for the new pipeline**

Add to `__tests__/financial-extractor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { prepareStructuredInput } from "../lib/financial-extractor";

const REACH_SUBSEA_EXCERPT = `
## Key figures

| |4Q 2023|4Q 2022|12M 2023|12M 2022|
|---|---|---|---|---|
|Revenue (NOKm)|474|327|1 996|1 163|
|EBIT (NOKm)|80|35|332|105|
|Equity (NOKm)|928|579|928|579|

## Income statement

|Statement of profit or loss (NOK 1000)|Q4 2023|Q4 2022|12M 2023|12M 2022|Notes|
|---|---|---|---|---|---|
|Revenue|474 138|327 413|1 995 903|1 162 821| |
|EBITDA|212 180|119 897|954 790|458 787| |
|Operating result (EBIT)|79 522|34 648|331 786|105 255| |

#### Balance Sheet

|Statement of financial position (NOK 1000)|31.12.2023|31.12.2022|Notes|
|---|---|---|---|
|Total assets|2 692 632|952 085| |
|Total equity|928 005|579 442| |

#### Cash flow

|Statement of cash flows (NOK 1000)|Q4 2023|Q4 2022|12M 2023|12M 2022|
|---|---|---|---|---|
|Cash from operating activities|547 639|120 497|1 053 715|293 261| |
`;

describe("prepareStructuredInput", () => {
  it("excludes key figures summary and includes financial statements", () => {
    const result = prepareStructuredInput(REACH_SUBSEA_EXCERPT);
    // Must include EBITDA from income statement
    expect(result).toContain("EBITDA");
    expect(result).toContain("212 180");
    // Must NOT include rounded values from key figures
    expect(result).not.toContain("Revenue (NOKm)");
    // Must include balance sheet and cash flow
    expect(result).toContain("BALANCE SHEET");
    expect(result).toContain("CASH FLOW");
  });

  it("includes unit context", () => {
    const result = prepareStructuredInput(REACH_SUBSEA_EXCERPT);
    expect(result).toContain("thousands");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/financial-extractor.test.ts`
Expected: FAIL — `prepareStructuredInput` not exported

- [ ] **Step 3: Add prepareStructuredInput and update extractFinancialData**

In `lib/financial-extractor.ts`, add the import at the top:

```typescript
import { parseMarkdownTables } from "./table-parser";
import { classifyTable } from "./table-classifier";
import { resolveUnits } from "./unit-resolver";
import { buildStructuredInput } from "./structured-input";
```

Add the new public function (replaces `extractFinancialSections`):

```typescript
/**
 * Structural pre-processing pipeline: parse tables, classify them,
 * resolve units, and build a clean LLM input with only financial
 * statement tables.
 *
 * Falls back to the old keyword-scored section extraction if no
 * financial tables are found (e.g. unusual report format).
 */
export function prepareStructuredInput(markdown: string): string {
  const tables = parseMarkdownTables(markdown);
  const classified = tables.map((table) => ({
    table,
    classification: classifyTable(table),
  }));
  const resolved = resolveUnits(classified);
  const structured = buildStructuredInput(resolved);

  // Fallback: if no financial tables were identified, use old approach
  if (!structured) {
    return stripNumericCommas(extractFinancialSections(markdown));
  }

  return stripNumericCommas(structured);
}
```

Replace the simplified LLM prompt. Change `EXTRACTION_PROMPT` to:

```typescript
const EXTRACTION_PROMPT = `Du er en ekspert på norsk finansanalyse.

Du mottar ferdig strukturerte finansielle tabeller (resultatregnskap, balanse, kontantstrøm) med eksplisitt enhetsangivelse. Tabellene er allerede identifisert og klassifisert — du trenger IKKE lete etter dem.

OPPGAVE 1 — VELG RIKTIG KOLONNE:
Hent alltid verdien for GJELDENDE rapporteringsperiode (frittstående kvartal, IKKE kumulativ).
- Hvis tabellen har BÅDE "Q4 2025" og "12M 2025": bruk "Q4 2025"
- Hvis tabellen har BÅDE "2Q 2025" og "6M 2025": bruk "2Q 2025"
- Forveksle IKKE med forrige-års sammenligning (f.eks. "Q4 2024") — det er historisk data.

OPPGAVE 2 — STANDARDISER METRIKKNAVNENE:
Bruk KUN disse navnene:
- resultat: driftsinntekter, driftsresultat, ebitda, resultat_for_skatt, aarsresultat, resultat_per_aksje
- balanse: sum_eiendeler, egenkapital, total_gjeld, kontanter, egenkapitalandel
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad

Kartlegging:
- Revenue / Total revenue / Omsetning / Driftsinntekter → "driftsinntekter"
- Operating profit / EBIT / Operating result → "driftsresultat"
- EBITDA / EBITDAR → "ebitda"
- Profit before tax / Resultat før skatt → "resultat_for_skatt"
- Profit / Net income / Årsresultat → "aarsresultat"
- Total assets / Sum eiendeler → "sum_eiendeler"
- Total equity / Egenkapital → "egenkapital"
- Total liabilities / Total gjeld → "total_gjeld"
- Cash / Cash and cash equivalents / Kontanter → "kontanter"
- Cash from operating activities → "operasjonell_kontantstrom"
- Cash from investing activities → "investeringsaktiviteter"
- Cash from financing activities → "finansieringsaktiviteter"

OPPGAVE 3 — NORMALISER VERDIER:
Enheten for hver tabell er oppgitt i inndataen. Bruk den til å konvertere til MILLIONER.
- Komma er allerede fjernet fra tall. Alle tall er rene (f.eks. 1252560).
- Negative tall kan vises som (tall) eller -tall.
- Behold full presisjon: 125897 i tusen → 125.897 MNOK, IKKE 126 MNOK.

OPPGAVE 4 — FINN VALUTA:
Se etter valutaindikatorer i tabelloverskriftene (NOK, EUR, USD, SEK, etc.).

Returner et JSON-objekt:
{
  "period": "<rapporteringsperiode, f.eks. 'Q4 2025' eller '1Q 2025'>",
  "reportType": "<årsrapport|kvartalsrapport|prospekt|børsmelding|annet>",
  "periodScope": "<standalone|cumulative>",
  "periodEvidence": "<EKSAKT kolonneoverskrift du hentet verdier fra>",
  "currency": "<NOK|EUR|USD|SEK|DKK|GBP>",
  "originalUnit": "<enhet fra inndataen, f.eks. thousands, millions>",
  "unitEvidence": "<enhetsbeskrivelse fra inndataen>",
  "metrics": [
    {
      "metricName": "<standardisert navn>",
      "value": <numerisk verdi i millioner>,
      "unit": "<MNOK|MEUR|MUSD|MSEK|MDKK|MGBP|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
}

Returner KUN gyldig JSON, ingen annen tekst.`;
```

Update `extractFinancialData` to use the new pipeline:

```typescript
export async function extractFinancialData(markdown: string): Promise<ExtractionResult> {
  const { getOpenAI } = await import("./openai");

  const financialContent = prepareStructuredInput(markdown);

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: financialContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Empty response from GPT-4o");

  const parsed = JSON.parse(content);
  const period = canonicalizePeriod(parsed.period || "");
  const reportType = parsed.reportType || "annet";
  const currency = parsed.currency || undefined;
  const originalUnit = parsed.originalUnit || undefined;
  const unitEvidence = parsed.unitEvidence || undefined;
  const periodScope = (parsed.periodScope === "cumulative" ? "cumulative" : "standalone") as "standalone" | "cumulative";
  const periodEvidence = parsed.periodEvidence || undefined;

  if (unitEvidence) {
    console.log(`[unit-detection] currency=${currency}, originalUnit=${originalUnit}, evidence="${unitEvidence}"`);
  }

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

  if (rejected.length > 0) {
    console.warn("Rejected metrics:", rejected);
  }

  return {
    period,
    reportType,
    periodScope,
    periodEvidence,
    currency,
    originalUnit,
    unitEvidence,
    metrics: valid,
  };
}
```

Keep `extractFinancialSections` in the file as an unexported fallback (used by `prepareStructuredInput` when no tables are found).

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/financial-extractor.ts __tests__/financial-extractor.test.ts
git commit -m "feat: integrate structural pipeline into financial extractor"
```

---

### Task 7: Add post-extraction sanity checks

**Files:**
- Modify: `lib/financial-extractor.ts`

- [ ] **Step 1: Add completeness check to validateMetrics**

In `lib/financial-extractor.ts`, add a logging function after `validateMetrics`:

```typescript
/**
 * Log warnings for expected metrics that are missing from extraction.
 * Does not block storage — informational only.
 */
export function checkCompleteness(
  metrics: ExtractedMetric[],
  structuredInput: string
): void {
  const expectedIfPresent: { metric: string; tableSignal: string }[] = [
    { metric: "driftsinntekter", tableSignal: "revenue" },
    { metric: "driftsresultat", tableSignal: "operating result" },
    { metric: "ebitda", tableSignal: "ebitda" },
    { metric: "aarsresultat", tableSignal: "profit" },
    { metric: "sum_eiendeler", tableSignal: "total assets" },
    { metric: "egenkapital", tableSignal: "total equity" },
  ];

  const inputLower = structuredInput.toLowerCase();
  const extractedNames = new Set(metrics.map((m) => m.metricName));

  for (const { metric, tableSignal } of expectedIfPresent) {
    if (!extractedNames.has(metric) && inputLower.includes(tableSignal)) {
      console.warn(
        `[completeness] "${metric}" missing from extraction but "${tableSignal}" present in input`
      );
    }
  }
}
```

- [ ] **Step 2: Wire it into extractFinancialData**

Add after the `validateMetrics` call in `extractFinancialData`:

```typescript
  checkCompleteness(valid, financialContent);
```

- [ ] **Step 3: Add cross-period magnitude check**

This will be a separate function that can be called from the upload route when historical metrics are available. Add to `lib/financial-extractor.ts`:

```typescript
/**
 * Compare new metrics against historical values for the same company.
 * Logs warnings for suspicious magnitude changes (>10x).
 */
export function checkMagnitude(
  newMetrics: ExtractedMetric[],
  historicalMetrics: { metricName: string; value: number }[]
): void {
  if (historicalMetrics.length === 0) return;

  const histMap = new Map<string, number>();
  for (const m of historicalMetrics) {
    // Keep the most recent value per metric
    histMap.set(m.metricName, m.value);
  }

  for (const metric of newMetrics) {
    const hist = histMap.get(metric.metricName);
    if (hist === undefined || hist === 0 || metric.unit === "%") continue;
    const ratio = Math.abs(metric.value / hist);
    if (ratio > 10 || ratio < 0.1) {
      console.warn(
        `[magnitude] "${metric.metricName}" changed ${ratio.toFixed(1)}x: ` +
        `${hist} → ${metric.value} ${metric.unit}`
      );
    }
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (no new tests needed — these are log-only functions)

- [ ] **Step 5: Commit**

```bash
git add lib/financial-extractor.ts
git commit -m "feat: add post-extraction completeness and magnitude checks"
```

---

### Task 8: Deploy and verify with real data

**Files:** none (verification only)

- [ ] **Step 1: Deploy Convex functions**

```bash
cd /Users/jonas/Desktop/Projects/finance-test && npx convex dev --once
```

- [ ] **Step 2: Run the pipeline on a Reach Subsea markdown that previously failed**

Use the 2023-Q4 document (which was missing EBITDA). Write a quick verification script:

```bash
npx tsx -e "
import { readFileSync } from 'fs';
import { prepareStructuredInput } from './lib/financial-extractor';

const md = readFileSync('/tmp/reach_2023q4.md', 'utf8');
const structured = prepareStructuredInput(md);
console.log('=== Structured Input ===');
console.log(structured.slice(0, 2000));
console.log('...');
console.log('Length:', structured.length, 'chars');
console.log('Has EBITDA:', structured.includes('EBITDA'));
console.log('Has Key figures:', structured.toLowerCase().includes('key figures'));
"
```

Expected:
- `Has EBITDA: true`
- `Has Key figures: false`
- Length should be ~3-5KB, not ~80KB

- [ ] **Step 3: Verify period format fix**

```bash
npx tsx -e "
import { canonicalizePeriod } from './lib/period-format';
console.log('1Q 2025 →', canonicalizePeriod('1Q 2025'));
console.log('4Q 2025 →', canonicalizePeriod('4Q 2025'));
console.log('6M 2024 →', canonicalizePeriod('6M 2024'));
console.log('12M 2024 →', canonicalizePeriod('12M 2024'));
"
```

Expected: `2025-Q1`, `2025-Q4`, `2024-H1`, `2024-FY`

- [ ] **Step 4: Commit all changes, push, create PR**

```bash
git push
gh pr create --title "feat: structural pre-processing for financial extraction" --body "..."
```
