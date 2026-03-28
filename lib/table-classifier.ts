// ParsedTable is defined here until table-parser.ts is available.
// When table-parser.ts lands, replace this block with:
//   import { type ParsedTable } from "./table-parser";
//   export type { ParsedTable };
export interface ParsedTable {
  heading: string;
  headerRow: string[];
  rows: { label: string; values: string[] }[];
  rawText: string;
  lineNumber: number;
  unitIndicator: string | null;
  detectedUnit: "thousands" | "millions" | "billions" | "whole" | null;
}

export type TableClass =
  | "income_statement"
  | "balance_sheet"
  | "cash_flow"
  | "key_figures_summary"
  | "notes"
  | "other";

const INCOME_HEADING = [
  "profit or loss",
  "resultatregnskap",
  "income statement",
  "comprehensive income",
  "profit and loss",
];

const INCOME_ROWS = [
  "ebitda",
  "operating result",
  "driftsresultat",
  "operating profit",
  "driftsresultat (ebit)",
];

const BALANCE_HEADING = [
  "financial position",
  "balanse",
  "balance sheet",
];

const BALANCE_ROWS = [
  "total assets",
  "sum eiendeler",
  "total equity",
  "egenkapital",
  "total equity and liabilities",
];

const CASHFLOW_HEADING = [
  "cash flow",
  "kontantstrøm",
  "kontantstrømoppstilling",
];

const CASHFLOW_ROWS = [
  "operating activities",
  "operasjonelle aktiviteter",
  "investeringsaktiviteter",
  "investing activities",
  "cash generated",
  "kontantstrøm fra drift",
];

const SUMMARY_HEADING = [
  "key figures",
  "nøkkeltall",
  "highlights",
  "hovedtall",
  "financial highlights",
];

const NOTES_HEADING = ["note ", "noter", "notes to"];

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export function classifyTable(table: ParsedTable): TableClass {
  const headingAndHeader = table.heading + " " + table.headerRow.join(" ");
  const rowLabels = table.rows.map((r) => r.label).join(" ");

  // Check financial statement types first (they take priority)
  if (matchesAny(headingAndHeader, INCOME_HEADING)) return "income_statement";
  if (matchesAny(headingAndHeader, BALANCE_HEADING)) return "balance_sheet";
  if (matchesAny(headingAndHeader, CASHFLOW_HEADING)) return "cash_flow";

  // Check row labels for financial statement signals
  if (matchesAny(rowLabels, INCOME_ROWS)) return "income_statement";
  if (matchesAny(rowLabels, BALANCE_ROWS)) return "balance_sheet";
  if (matchesAny(rowLabels, CASHFLOW_ROWS)) return "cash_flow";

  // Lower priority: summaries and notes
  if (matchesAny(headingAndHeader, SUMMARY_HEADING))
    return "key_figures_summary";
  if (matchesAny(headingAndHeader, NOTES_HEADING)) return "notes";

  return "other";
}
