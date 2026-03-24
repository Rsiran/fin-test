const quarterWords: Record<string, string> = {
  "første": "1", "andre": "2", "tredje": "3", "fjerde": "4",
  "1.": "1", "2.": "2", "3.": "3", "4.": "4",
};

export function canonicalizePeriod(input: string): string {
  const s = input.trim().toLowerCase();

  const qMatch = s.match(/q(\d)\s*(\d{4})/);
  if (qMatch) return `${qMatch[2]}-Q${qMatch[1]}`;

  const kvMatch = s.match(/(\S+)\s*kvartal\s*(\d{4})/);
  if (kvMatch) {
    const q = quarterWords[kvMatch[1]] ?? kvMatch[1];
    if (/^[1-4]$/.test(q)) return `${kvMatch[2]}-Q${q}`;
  }

  const hMatch = s.match(/h([12])\s*(\d{4})/);
  if (hMatch) return `${hMatch[2]}-H${hMatch[1]}`;

  const halvMatch = s.match(/halvårsrapport\s*(\d{4})/);
  if (halvMatch) return `${halvMatch[1]}-H1`;

  const fyMatch = s.match(/fy\s*(\d{4})/);
  if (fyMatch) return `${fyMatch[1]}-FY`;

  const arsMatch = s.match(/årsrapport\s*(\d{4})/);
  if (arsMatch) return `${arsMatch[1]}-FY`;

  const yearMatch = s.match(/^(\d{4})$/);
  if (yearMatch) return `${yearMatch[1]}-FY`;

  return input;
}

/**
 * Convert a canonical period (e.g. "2024-Q2", "2024-FY", "2025-H1")
 * to a standardized file name. Returns null for unrecognized formats.
 *
 * Examples: "2024-Q2" → "2Q24", "2024-FY" → "AR24", "2025-H1" → "H125"
 */
export function periodToFileName(period: string): string | null {
  const qMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) return `${qMatch[2]}Q${qMatch[1].slice(2)}`;

  const fyMatch = period.match(/^(\d{4})-FY$/);
  if (fyMatch) return `AR${fyMatch[1].slice(2)}`;

  const hMatch = period.match(/^(\d{4})-H([12])$/);
  if (hMatch) return `H${hMatch[2]}${hMatch[1].slice(2)}`;

  return null;
}

export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort();
}
