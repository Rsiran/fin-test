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
