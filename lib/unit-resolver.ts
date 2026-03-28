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
  thousands: "Values are in thousands — divide by 1000 to get millions.",
  millions: "Values are already in millions. Use as-is.",
  billions: "Values are in billions — multiply by 1000 to get millions.",
  whole: "Values are in whole currency units — divide by 1000000 to get millions.",
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
