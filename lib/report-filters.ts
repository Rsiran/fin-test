interface DocumentLike {
  _id: string;
  reportType: string;
  period: string;
  status: string;
}

export function extractYear(period: string): string | null {
  const match = period.match(/^(\d{4})-/);
  return match ? match[1] : null;
}

export function getFilterOptions<T extends DocumentLike>(documents: T[]): {
  types: string[];
  years: string[];
} {
  const ready = documents.filter((d) => d.status === "ready");

  const types = [...new Set(ready.map((d) => d.reportType))];
  const years = [
    ...new Set(
      ready.map((d) => extractYear(d.period)).filter((y): y is string => y !== null)
    ),
  ].sort((a, b) => b.localeCompare(a));

  return { types, years };
}

export function filterDocuments<T extends DocumentLike>(
  documents: T[],
  selectedTypes: string[],
  selectedYears: string[],
): T[] {
  return documents.filter((d) => {
    if (selectedTypes.length > 0 && !selectedTypes.includes(d.reportType)) return false;
    const year = extractYear(d.period);
    if (selectedYears.length > 0 && (!year || !selectedYears.includes(year))) return false;
    return true;
  });
}

export function filterMetricsByDocuments<T extends { documentId: string; source?: string; derivation?: { operands: { documentId: string }[] } }>(
  metrics: T[],
  filteredDocIds: Set<string>,
): T[] {
  return metrics.filter((m) => {
    if (m.source === "derived" && m.derivation) {
      return m.derivation.operands.some((op) => filteredDocIds.has(op.documentId));
    }
    return filteredDocIds.has(m.documentId);
  });
}

export function getReadyCounts<T extends DocumentLike>(
  allDocuments: T[],
  filteredDocuments: T[],
): { total: number; filtered: number } {
  const total = allDocuments.filter((d) => d.status === "ready").length;
  const filtered = filteredDocuments.filter((d) => d.status === "ready").length;
  return { total, filtered };
}
