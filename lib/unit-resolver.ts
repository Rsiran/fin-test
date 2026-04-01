import { type ParsedTable } from "./table-parser";
import { type TableClass } from "./table-classifier";

interface ClassifiedTable {
  table: ParsedTable;
  classification: TableClass;
}

export interface ResolvedTable extends ClassifiedTable {
  resolvedUnit: ParsedTable["detectedUnit"];
  resolvedCurrency: string | null;
  unitContext: string;
}

const UNIT_CONTEXT: Record<string, string> = {
  thousands: "Values are in thousands — divide by 1000 to get millions.",
  millions: "Values are already in millions. Use as-is.",
  billions: "Values are in billions — multiply by 1000 to get millions.",
  whole: "Values are in whole currency units — divide by 1000000 to get millions.",
};

export function resolveUnits(tables: ClassifiedTable[]): ResolvedTable[] {
  const financialTypes: TableClass[] = ["income_statement", "balance_sheet", "cash_flow"];

  const resolved = tables.map((ct) => {
    const resolvedUnit = ct.table.detectedUnit;
    const resolvedCurrency = ct.table.detectedCurrency ?? null;
    const currencyLabel = resolvedCurrency ? ` ${resolvedCurrency}` : "";
    const unitContext = resolvedUnit
      ? `${UNIT_CONTEXT[resolvedUnit]}${currencyLabel ? ` Currency:${currencyLabel}.` : ""}`
      : "No unit detected. Infer from value magnitudes.";

    return { ...ct, resolvedUnit, resolvedCurrency, unitContext };
  });

  // Consistency warning: check if financial tables disagree on unit or currency
  const financialTables = resolved.filter((t) => financialTypes.includes(t.classification));
  const explicitUnits = financialTables.filter((t) => t.resolvedUnit).map((t) => t.resolvedUnit);
  const explicitCurrencies = financialTables.filter((t) => t.resolvedCurrency).map((t) => t.resolvedCurrency);

  if (new Set(explicitUnits).size > 1) {
    console.warn(
      `[unit-resolver] Conflicting units across financial tables: ${[...new Set(explicitUnits)].join(", ")}`
    );
  }
  if (new Set(explicitCurrencies).size > 1) {
    console.warn(
      `[unit-resolver] Conflicting currencies across financial tables: ${[...new Set(explicitCurrencies)].join(", ")}`
    );
  }

  return resolved;
}
