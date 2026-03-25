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
  selectedType: string | null;
  selectedYear: string | null;
  setType: (type: string | null) => void;
  setYear: (year: string | null) => void;
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
  type: string | null;
  year: string | null;
} {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${companyId}`);
    if (!raw) return { type: null, year: null };
    return JSON.parse(raw);
  } catch {
    return { type: null, year: null };
  }
}

function writeStorage(
  companyId: string,
  type: string | null,
  year: string | null,
) {
  localStorage.setItem(
    `${STORAGE_PREFIX}${companyId}`,
    JSON.stringify({ type, year }),
  );
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

  const [selectedType, setSelectedType] = useState<string | null>(() => {
    const urlType = searchParams.get("type");
    if (urlType) return urlType;
    if (typeof window !== "undefined") return readStorage(companyId).type;
    return null;
  });

  const [selectedYear, setSelectedYear] = useState<string | null>(() => {
    const urlYear = searchParams.get("year");
    if (urlYear) return urlYear;
    if (typeof window !== "undefined") return readStorage(companyId).year;
    return null;
  });

  const typeRef = useRef(selectedType);
  typeRef.current = selectedType;
  const yearRef = useRef(selectedYear);
  yearRef.current = selectedYear;

  const documents = useQuery(api.documents.listByCompany, { companyId });
  const metrics = useQuery(api.financialMetrics.getByCompany, { companyId });
  const isLoading = documents === undefined || metrics === undefined;

  const filterOpts = useMemo(
    () => (documents ? getFilterOptions(documents as any) : { types: [], years: [] }),
    [documents],
  );

  const syncState = useCallback(
    (type: string | null, year: string | null) => {
      writeStorage(companyId, type, year);
      const params = new URLSearchParams(searchParams.toString());
      if (type) params.set("type", type);
      else params.delete("type");
      if (year) params.set("year", year);
      else params.delete("year");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [companyId, searchParams, router, pathname],
  );

  useEffect(() => {
    if (!documents) return;
    let newType = selectedType;
    let newYear = selectedYear;
    if (selectedType && !filterOpts.types.includes(selectedType)) {
      newType = null;
      setSelectedType(null);
    }
    if (selectedYear && !filterOpts.years.includes(selectedYear)) {
      newYear = null;
      setSelectedYear(null);
    }
    if (newType !== selectedType || newYear !== selectedYear) {
      syncState(newType, newYear);
    }
  }, [filterOpts, selectedType, selectedYear, documents, syncState]);

  const setType = useCallback(
    (type: string | null) => {
      setSelectedType(type);
      syncState(type, yearRef.current);
    },
    [syncState],
  );

  const setYear = useCallback(
    (year: string | null) => {
      setSelectedYear(year);
      syncState(typeRef.current, year);
    },
    [syncState],
  );

  const resetFilters = useCallback(() => {
    setSelectedType(null);
    setSelectedYear(null);
    syncState(null, null);
  }, [syncState]);

  const filteredDocs = useMemo(
    () =>
      documents
        ? filterDocuments(documents as any, selectedType, selectedYear)
        : undefined,
    [documents, selectedType, selectedYear],
  );

  const filteredMets = useMemo(() => {
    if (!metrics || !filteredDocs) return undefined;
    if (!selectedType && !selectedYear) return metrics;
    const readyDocIds = new Set(
      filteredDocs.filter((d: any) => d.status === "ready").map((d: any) => d._id),
    );
    return filterMetricsByDocuments(metrics as any, readyDocIds as any);
  }, [metrics, filteredDocs, selectedType, selectedYear]);

  const counts = useMemo(
    () =>
      documents && filteredDocs
        ? getReadyCounts(documents as any, filteredDocs as any)
        : { total: 0, filtered: 0 },
    [documents, filteredDocs],
  );

  const isFiltered = selectedType !== null || selectedYear !== null;

  const value = useMemo(
    () => ({
      selectedType,
      selectedYear,
      setType,
      setYear,
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
      selectedType,
      selectedYear,
      setType,
      setYear,
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
