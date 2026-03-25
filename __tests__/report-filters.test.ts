import { describe, it, expect } from "vitest";
import {
  extractYear,
  getFilterOptions,
  filterDocuments,
  filterMetricsByDocuments,
  getReadyCounts,
} from "@/lib/report-filters";

describe("extractYear", () => {
  it("extracts year from quarterly period", () => {
    expect(extractYear("2024-Q1")).toBe("2024");
  });
  it("extracts year from FY period", () => {
    expect(extractYear("2024-FY")).toBe("2024");
  });
  it("extracts year from half-year period", () => {
    expect(extractYear("2025-H1")).toBe("2025");
  });
  it("returns null for unknown format", () => {
    expect(extractYear("unknown")).toBeNull();
  });
});

describe("getFilterOptions", () => {
  const docs = [
    { reportType: "kvartalsrapport", period: "2024-Q1", status: "ready" },
    { reportType: "kvartalsrapport", period: "2024-Q2", status: "ready" },
    { reportType: "årsrapport", period: "2024-FY", status: "ready" },
    { reportType: "kvartalsrapport", period: "2025-Q1", status: "processing" },
  ];

  it("returns distinct types from ready documents only", () => {
    const opts = getFilterOptions(docs as any);
    expect(opts.types).toEqual(["kvartalsrapport", "årsrapport"]);
  });

  it("returns distinct years from ready documents, sorted descending", () => {
    const opts = getFilterOptions(docs as any);
    expect(opts.years).toEqual(["2024"]);
  });
});

describe("filterDocuments", () => {
  const docs = [
    { _id: "1", reportType: "kvartalsrapport", period: "2024-Q1", status: "ready" },
    { _id: "2", reportType: "årsrapport", period: "2024-FY", status: "ready" },
    { _id: "3", reportType: "kvartalsrapport", period: "2025-Q1", status: "ready" },
    { _id: "4", reportType: "kvartalsrapport", period: "2025-Q2", status: "processing" },
  ];

  it("returns all docs when no filters active", () => {
    expect(filterDocuments(docs as any, [], [])).toHaveLength(4);
  });

  it("filters by single type", () => {
    const result = filterDocuments(docs as any, ["årsrapport"], []);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("2");
  });

  it("filters by multiple types", () => {
    const result = filterDocuments(docs as any, ["årsrapport", "kvartalsrapport"], []);
    expect(result).toHaveLength(4);
  });

  it("filters by single year", () => {
    const result = filterDocuments(docs as any, [], ["2025"]);
    expect(result).toHaveLength(2);
  });

  it("filters by multiple years", () => {
    const result = filterDocuments(docs as any, [], ["2024", "2025"]);
    expect(result).toHaveLength(4);
  });

  it("filters by type AND year", () => {
    const result = filterDocuments(docs as any, ["kvartalsrapport"], ["2025"]);
    expect(result).toHaveLength(2);
  });

  it("includes non-ready docs that match filters", () => {
    const result = filterDocuments(docs as any, ["kvartalsrapport"], ["2025"]);
    expect(result.some((d: any) => d.status === "processing")).toBe(true);
  });
});

describe("filterMetricsByDocuments", () => {
  const metrics = [
    { documentId: "doc1", metricName: "revenue", value: 100 },
    { documentId: "doc2", metricName: "ebitda", value: 50 },
    { documentId: "doc3", metricName: "margin", value: 10 },
  ];

  it("returns only metrics whose documentId is in the set", () => {
    const ids = new Set(["doc1", "doc3"]);
    const result = filterMetricsByDocuments(metrics, ids);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.documentId)).toEqual(["doc1", "doc3"]);
  });

  it("returns empty array when no IDs match", () => {
    const ids = new Set(["doc99"]);
    expect(filterMetricsByDocuments(metrics, ids)).toHaveLength(0);
  });
});

describe("getReadyCounts", () => {
  const all = [
    { _id: "1", reportType: "a", period: "2024-Q1", status: "ready" },
    { _id: "2", reportType: "b", period: "2024-FY", status: "ready" },
    { _id: "3", reportType: "a", period: "2025-Q1", status: "processing" },
  ];

  it("counts only ready documents", () => {
    const filtered = [all[0], all[2]];
    const counts = getReadyCounts(all as any, filtered as any);
    expect(counts.total).toBe(2);
    expect(counts.filtered).toBe(1);
  });
});
