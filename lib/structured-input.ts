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
