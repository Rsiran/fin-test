"use client";

import { useState, useRef, useEffect } from "react";
import { useReportFilter } from "./report-filter-context";

const REPORT_TYPE_LABELS: Record<string, string> = {
  årsrapport: "Årsrapporter",
  kvartalsrapport: "Kvartalsrapporter",
  prospekt: "Prospekter",
  børsmelding: "Børsmeldinger",
  annet: "Annet",
};

function formatReportType(value: string): string {
  return REPORT_TYPE_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  formatLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  formatLabel?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fmt = formatLabel ?? ((v: string) => v);
  const displayText =
    selected.length === 0
      ? label
      : selected.length === 1
        ? fmt(selected[0])
        : `${selected.length} valgt`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-elevated border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#AAAAAA] focus:outline-none focus:border-accent/50 transition-colors duration-150 flex items-center gap-2 min-w-[120px]"
      >
        <span className={selected.length > 0 ? "text-[#F5F5F5]" : ""}>
          {displayText}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          className={`ml-auto transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-elevated border border-white/10 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
          {options.map((option) => {
            const isChecked = selected.includes(option);
            return (
              <button
                key={option}
                onClick={() => onToggle(option)}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-[#AAAAAA] hover:bg-white/[0.05] cursor-pointer transition-colors duration-150 w-full"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                    isChecked
                      ? "bg-accent border-accent"
                      : "border-white/20 bg-transparent"
                  }`}
                >
                  {isChecked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={isChecked ? "text-[#F5F5F5]" : ""}>{fmt(option)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ReportFilterBar() {
  const {
    selectedTypes,
    selectedYears,
    toggleType,
    toggleYear,
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
      <MultiSelect
        label="Alle rapporter"
        options={filterOptions.types}
        selected={selectedTypes}
        onToggle={toggleType}
        formatLabel={formatReportType}
      />
      <MultiSelect
        label="Alle år"
        options={filterOptions.years}
        selected={selectedYears}
        onToggle={toggleYear}
      />

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
