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
    resolvedCurrency: null,
    unitContext: resolvedUnit === "thousands" ? "Values are in thousands. Divide by 1000 to get millions." : "",
    table: {
      heading,
      headerRow,
      rows,
      rawText: "",
      lineNumber: 0,
      unitIndicator: null,
      detectedUnit: resolvedUnit,
      detectedCurrency: null,
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
    expect(input).toContain("Divide");
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
