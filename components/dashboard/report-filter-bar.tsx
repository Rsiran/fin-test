"use client";

import { useReportFilter } from "./report-filter-context";

export function ReportFilterBar() {
  const {
    selectedType,
    selectedYear,
    setType,
    setYear,
    resetFilters,
    filterOptions,
    totalCount,
    filteredCount,
    isFiltered,
    isLoading,
  } = useReportFilter();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-8 py-3 border-b border-white/5">
        <div className="skeleton h-8 w-32 rounded-lg" />
        <div className="skeleton h-8 w-24 rounded-lg" />
      </div>
    );
  }

  if (filterOptions.types.length === 0 && filterOptions.years.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-8 py-3 border-b border-white/5">
      <select
        value={selectedType ?? ""}
        onChange={(e) => setType(e.target.value || null)}
        className="bg-elevated border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#AAAAAA] focus:outline-none focus:border-accent/50 transition-colors duration-150"
      >
        <option value="">Alle typer</option>
        {filterOptions.types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <select
        value={selectedYear ?? ""}
        onChange={(e) => setYear(e.target.value || null)}
        className="bg-elevated border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#AAAAAA] focus:outline-none focus:border-accent/50 transition-colors duration-150"
      >
        <option value="">Alle år</option>
        {filterOptions.years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      {isFiltered && (
        <>
          <span className="text-xs text-[#666666] ml-2">
            Viser {filteredCount} av {totalCount} rapporter
          </span>
          <button
            onClick={resetFilters}
            className="text-xs text-accent hover:text-accent/80 transition-colors duration-150 ml-1"
          >
            Nullstill
          </button>
        </>
      )}
    </div>
  );
}
