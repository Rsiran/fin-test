import { describe, it, expect } from "vitest";
import { classifyTable, type TableClass } from "../lib/table-classifier";
import { type ParsedTable } from "../lib/table-classifier";

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

  it("does not classify APM definition tables as income_statement", () => {
    expect(
      classifyTable(
        makeTable({
          heading: "Alternative Performance Measures",
          headerRow: ["Measure", "Description", "Reason for including"],
          rows: [
            { label: "EBITDA", values: ["Earnings before interest, taxes, depreciation and amortization", "Shows operational profitability"] },
            { label: "Adjusted EBITDA", values: ["EBITDA adjusted for special items", "Comparable performance"] },
          ],
        })
      )
    ).toBe("other");
  });

  it("still classifies tables with numeric values as income_statement", () => {
    expect(
      classifyTable(
        makeTable({
          heading: "Income statement",
          rows: [
            { label: "Revenue", values: ["606 077", "684 809"] },
            { label: "EBITDA", values: ["228 315", "300 178"] },
          ],
        })
      )
    ).toBe("income_statement");
  });
});
