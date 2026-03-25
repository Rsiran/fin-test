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

export function getFilterOptions(documents: DocumentLike[]): {
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

export function filterDocuments(
  documents: DocumentLike[],
  selectedType: string | null,
  selectedYear: string | null,
): DocumentLike[] {
  return documents.filter((d) => {
    if (selectedType && d.reportType !== selectedType) return false;
    if (selectedYear && extractYear(d.period) !== selectedYear) return false;
    return true;
  });
}

export function filterMetricsByDocuments(
  metrics: { documentId: string }[],
  filteredDocIds: Set<string>,
): typeof metrics {
  return metrics.filter((m) => filteredDocIds.has(m.documentId));
}

export function getReadyCounts(
  allDocuments: DocumentLike[],
  filteredDocuments: DocumentLike[],
): { total: number; filtered: number } {
  const total = allDocuments.filter((d) => d.status === "ready").length;
  const filtered = filteredDocuments.filter((d) => d.status === "ready").length;
  return { total, filtered };
}
