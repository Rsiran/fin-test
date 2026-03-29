/**
 * Detect column count and structure in flat-text financial data.
 * Returns a hint string for the LLM, or null if detection fails.
 *
 * Only samples lines from financial statement sections (after headings
 * like "Income statement", "Balance sheet", etc.) to avoid being
 * misled by narrative text with incidental numbers.
 */
export function detectColumnHints(markdown: string, usedStructuredPath: boolean): string | null {
  // Skip when the structured path succeeded — column hints are only for flat text
  if (usedStructuredPath) return null;

  const lines = markdown.split("\n");

  // Financial statement headings (must be the primary heading, not narrative sections)
  const financialHeadings = [
    "income statement", "resultatregnskap",
    "statement of financial position", "balance sheet", "balanse",
    "statement of cash flows", "kontantstrømoppstilling",
    "condensed consolidated financial statements",
  ];

  // Find where financial statements start (skip narrative sections like
  // "Cash flow and financial position" which discuss but don't contain the data)
  let financialStartLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Must be a markdown heading
    if (!trimmed.startsWith("#")) continue;
    const headingText = trimmed.replace(/^#+\s*/, "").toLowerCase();
    if (financialHeadings.some((h) => headingText === h || headingText.startsWith(h))) {
      financialStartLine = i;
      break;
    }
  }

  // If no financial section found, fall back to scanning entire document
  const startLine = financialStartLine >= 0 ? financialStartLine : 0;

  // Find lines that look like financial data rows: "Label number number..."
  // Numbers can be: 1,694 or -139 or (139) or 6,385 or 1694
  const numberPattern = /(?:-?\d[\d,]*\.?\d*|\(\d[\d,]*\.?\d*\))/g;

  const dataLines: { label: string; numCount: number; lineIdx: number }[] = [];

  for (let i = startLine; i < lines.length; i++) {
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
    if (numbers.every((n) => /^\d{4}$/.test(n))) continue;

    // Skip short labels that are likely narrative fragments
    if (label.split(/\s+/).length > 10) continue;

    // Skip lines with too many numbers — likely multiple rows merged into one line
    if (numbers.length > 8) continue;

    dataLines.push({ label, numCount: numbers.length, lineIdx: i });

    if (dataLines.length >= 5) break;
  }

  if (dataLines.length < 2) return null;

  // Column count = most common number count across data lines
  const counts = dataLines.map((d) => d.numCount);
  const frequency = new Map<number, number>();
  for (const c of counts) {
    frequency.set(c, (frequency.get(c) || 0) + 1);
  }
  let columnCount = 0;
  let maxFreq = 0;
  for (const [count, freq] of frequency) {
    if (freq > maxFreq) {
      maxFreq = freq;
      columnCount = count;
    }
  }

  if (columnCount < 2) return null;

  return `This flat-text report has ${columnCount} value columns per row. Extract from the FIRST column only (current standalone quarter/period). Ignore all other columns — they are comparison periods.`;
}
