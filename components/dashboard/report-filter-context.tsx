"use client";

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  getFilterOptions,
  filterDocuments,
  filterMetricsByDocuments,
  getReadyCounts,
} from "@/lib/report-filters";

interface ReportFilterContextValue {
  selectedTypes: string[];
  selectedYears: string[];
  toggleType: (type: string) => void;
  toggleYear: (year: string) => void;
  resetFilters: () => void;
  allDocuments: any[] | undefined;
  filteredDocuments: any[] | undefined;
  filteredMetrics: any[] | undefined;
  filterOptions: { types: string[]; years: string[] };
  totalCount: number;
  filteredCount: number;
  isFiltered: boolean;
  isLoading: boolean;
}

const ReportFilterContext = createContext<ReportFilterContextValue | null>(null);

const STORAGE_PREFIX = "filters:";

function readStorage(companyId: string): {
  types: string[];
  years: string[];
} {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${companyId}`);
    if (!raw) return { types: [], years: [] };
    const parsed = JSON.parse(raw);
    // Migration: handle old single-value format
    if ("type" in parsed) {
      return {
        types: parsed.type ? [parsed.type] : [],
        years: parsed.year ? [parsed.year] : [],
      };
    }
    return {
      types: Array.isArray(parsed.types) ? parsed.types : [],
      years: Array.isArray(parsed.years) ? parsed.years : [],
    };
  } catch {
    return { types: [], years: [] };
  }
}

function writeStorage(
  companyId: string,
  types: string[],
  years: string[],
) {
  localStorage.setItem(
    `${STORAGE_PREFIX}${companyId}`,
    JSON.stringify({ types, years }),
  );
}

function parseUrlArray(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").filter(Boolean);
}

function toUrlParam(values: string[]): string | null {
  return values.length > 0 ? values.join(",") : null;
}

export function ReportFilterProvider({
  companyId,
  children,
}: {
  companyId: Id<"companies">;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    const urlTypes = parseUrlArray(searchParams.get("type"));
    if (urlTypes.length > 0) return urlTypes;
    if (typeof window !== "undefined") return readStorage(companyId).types;
    return [];
  });

  const [selectedYears, setSelectedYears] = useState<string[]>(() => {
    const urlYears = parseUrlArray(searchParams.get("year"));
    if (urlYears.length > 0) return urlYears;
    if (typeof window !== "undefined") return readStorage(companyId).years;
    return [];
  });

  const typesRef = useRef(selectedTypes);
  typesRef.current = selectedTypes;
  const yearsRef = useRef(selectedYears);
  yearsRef.current = selectedYears;

  const documents = useQuery(api.documents.listByCompany, { companyId });
  const metrics = useQuery(api.financialMetrics.getByCompany, { companyId });
  const isLoading = documents === undefined || metrics === undefined;

  const filterOpts = useMemo(
    () => (documents ? getFilterOptions(documents as any) : { types: [], years: [] }),
    [documents],
  );

  const syncState = useCallback(
    (types: string[], years: string[]) => {
      writeStorage(companyId, types, years);
      const params = new URLSearchParams(searchParams.toString());
      const typeParam = toUrlParam(types);
      if (typeParam) params.set("type", typeParam);
      else params.delete("type");
      const yearParam = toUrlParam(years);
      if (yearParam) params.set("year", yearParam);
      else params.delete("year");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [companyId, searchParams, router, pathname],
  );

  // Validate: remove any selected values that no longer exist in options
  useEffect(() => {
    if (!documents) return;
    const validTypes = selectedTypes.filter((t) => filterOpts.types.includes(t));
    const validYears = selectedYears.filter((y) => filterOpts.years.includes(y));
    const typesChanged = validTypes.length !== selectedTypes.length;
    const yearsChanged = validYears.length !== selectedYears.length;
    if (typesChanged || yearsChanged) {
      setSelectedTypes(validTypes);
      setSelectedYears(validYears);
      syncState(validTypes, validYears);
    }
  }, [filterOpts, selectedTypes, selectedYears, documents, syncState]);

  const toggleType = useCallback(
    (type: string) => {
      const current = typesRef.current;
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      setSelectedTypes(next);
      syncState(next, yearsRef.current);
    },
    [syncState],
  );

  const toggleYear = useCallback(
    (year: string) => {
      const current = yearsRef.current;
      const next = current.includes(year)
        ? current.filter((y) => y !== year)
        : [...current, year];
      setSelectedYears(next);
      syncState(typesRef.current, next);
    },
    [syncState],
  );

  const resetFilters = useCallback(() => {
    setSelectedTypes([]);
    setSelectedYears([]);
    syncState([], []);
  }, [syncState]);

  const filteredDocs = useMemo(
    () =>
      documents
        ? filterDocuments(documents as any, selectedTypes, selectedYears)
        : undefined,
    [documents, selectedTypes, selectedYears],
  );

  const filteredMets = useMemo(() => {
    if (!metrics || !filteredDocs) return undefined;
    if (selectedTypes.length === 0 && selectedYears.length === 0) return metrics;
    const readyDocIds = new Set(
      filteredDocs.filter((d: any) => d.status === "ready").map((d: any) => d._id),
    );
    return filterMetricsByDocuments(metrics as any, readyDocIds as any);
  }, [metrics, filteredDocs, selectedTypes, selectedYears]);

  const counts = useMemo(
    () =>
      documents && filteredDocs
        ? getReadyCounts(documents as any, filteredDocs as any)
        : { total: 0, filtered: 0 },
    [documents, filteredDocs],
  );

  const isFiltered = selectedTypes.length > 0 || selectedYears.length > 0;

  const value = useMemo(
    () => ({
      selectedTypes,
      selectedYears,
      toggleType,
      toggleYear,
      resetFilters,
      allDocuments: documents,
      filteredDocuments: filteredDocs,
      filteredMetrics: filteredMets,
      filterOptions: filterOpts,
      totalCount: counts.total,
      filteredCount: counts.filtered,
      isFiltered,
      isLoading,
    }),
    [
      selectedTypes,
      selectedYears,
      toggleType,
      toggleYear,
      resetFilters,
      documents,
      filteredDocs,
      filteredMets,
      filterOpts,
      counts,
      isFiltered,
      isLoading,
    ],
  );

  return (
    <ReportFilterContext.Provider value={value}>
      {children}
    </ReportFilterContext.Provider>
  );
}

export function useReportFilter() {
  const ctx = useContext(ReportFilterContext);
  if (!ctx)
    throw new Error("useReportFilter must be used within ReportFilterProvider");
  return ctx;
}
