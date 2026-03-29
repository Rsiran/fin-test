/**
 * Detect column count and structure in flat-text financial data.
 * Returns a hint string for the LLM, or null if detection fails.
 */
export function detectColumnHints(markdown: string, usedStructuredPath: boolean): string | null {
  // Skip when the structured path succeeded — column hints are only for flat text
  if (usedStructuredPath) return null;

  const lines = markdown.split("\n");

  // Find lines that look like financial data rows: "Label number number..."
  // Numbers can be: 1,694 or -139 or (139) or 6,385 or 1694
  const numberPattern = /(?:-?\d[\d,]*\.?\d*|\(\d[\d,]*\.?\d*\))/g;

  let dataLineCount = 0;
  let columnCount = 0;
  const dataLines: { label: string; numCount: number; lineIdx: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const numbers = line.match(numberPattern);
    if (!numbers || numbers.length < 2) continue;

    // Extract the label (text before the first number)
    const firstNumIdx = line.search(numberPattern);
    const label = line.slice(0, firstNumIdx).trim();

    // Skip lines that look like headers (contain only years/quarters)
    if (!label || /^\d{4}$/.test(label) || /^Q\d/i.test(label)) continue;

    // Skip lines where "numbers" are just years (e.g. "2025 2024 2023")
    // Don't strip commas — real years never contain them, but financial
    // numbers like 1,694 would incorrectly look like year 1694 without commas.
    if (numbers.every((n) => /^\d{4}$/.test(n))) continue;

    dataLines.push({ label, numCount: numbers.length, lineIdx: i });
    dataLineCount++;

    if (dataLineCount >= 3) break;
  }

  if (dataLines.length < 2) return null;

  // Column count = most common number count across data lines
  const counts = dataLines.map((d) => d.numCount);
  columnCount = counts.sort(
    (a, b) =>
      counts.filter((v) => v === b).length -
      counts.filter((v) => v === a).length
  )[0];

  if (columnCount < 2) return null;

  return `This flat-text report has ${columnCount} value columns per row. Extract from the FIRST column only (current standalone quarter/period). Ignore all other columns — they are comparison periods.`;
}
