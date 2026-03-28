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
