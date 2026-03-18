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

export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort();
}
