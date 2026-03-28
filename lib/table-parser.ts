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
  /\bNOKm\b/i, /\bEURm\b/i, /\bUSDm\b/i,
  /\(NOKm\)/i, /\(EURm\)/i, /\(USDm\)/i,
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
    .slice(1, -1)
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

    if (line.startsWith("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1].trim())) {
      const tableStartLine = i;
      const headerCells = parseTableRow(line);

      i += 2;

      const rows: { label: string; values: string[] }[] = [];
      const rawLines = [lines[tableStartLine], lines[tableStartLine + 1]];

      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rawLines.push(lines[i]);
        const cells = parseTableRow(lines[i]);
        if (cells.length >= 2) {
          const label = cells[0];
          const values = cells.slice(1);
          const expanded = expandBrRows(label, values);
          rows.push(...expanded);
        }
        i++;
      }

      const heading = findHeading(lines, tableStartLine);
      const headerText = headerCells.join(" ") + " " + heading;
      let { indicator, unit } = detectUnit(headerText);

      if (!indicator) {
        const allLabels = rows.map((r) => r.label).join(" ");
        ({ indicator, unit } = detectUnit(allLabels));
      }

      tables.push({
        heading,
        headerRow: headerCells,
        rows,
        rawText: rawLines.join("\n"),
        lineNumber: tableStartLine + 1,
        unitIndicator: indicator,
        detectedUnit: unit,
      });
    } else {
      i++;
    }
  }

  return tables;
}
