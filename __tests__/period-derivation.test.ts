import { describe, it, expect } from "vitest";
import { deriveStandaloneQuarters, type StoredMetric } from "../lib/period-derivation";

function makeMetric(overrides: Partial<StoredMetric> & Pick<StoredMetric, "period" | "metricName" | "value">): StoredMetric {
  return {
    documentId: "doc_1",
    companyId: "comp_1",
    category: "resultat",
    unit: "MEUR",
    createdAt: 0,
    ...overrides,
  };
}

describe("deriveStandaloneQuarters", () => {
  it("derives Q2 from H1 and Q1, hides H1", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    expect(q2).toBeDefined();
    expect(q2!.value).toBe(250);
    expect(q2!.source).toBe("derived");
    expect(q2!.derivation?.formula).toBe("H1 - Q1");
    // H1 should be hidden since Q2 was derived
    expect(result.find((m) => m.period === "2025-H1")).toBeUndefined();
  });

  it("derives Q3 from 9M and H1, hides 9M", () => {
    const metrics = [
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 300 }),
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q3 = result.find((m) => m.period === "2025-Q3" && m.metricName === "driftsinntekter");
    expect(q3).toBeDefined();
    expect(q3!.value).toBe(150);
    // 9M hidden (Q3 derived), H1 stays (Q2 not derived — no Q1)
    expect(result.find((m) => m.period === "2025-9M")).toBeUndefined();
    expect(result.find((m) => m.period === "2025-H1")).toBeDefined();
  });

  it("derives Q4 from FY and 9M, keeps FY visible", () => {
    const metrics = [
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450 }),
      makeMetric({ period: "2025-FY", metricName: "driftsinntekter", value: 600 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q4 = result.find((m) => m.period === "2025-Q4" && m.metricName === "driftsinntekter");
    expect(q4).toBeDefined();
    expect(q4!.value).toBe(150);
    // FY stays visible (annual figure), 9M stays (Q3 not derived — no H1)
    expect(result.find((m) => m.period === "2025-FY")).toBeDefined();
    expect(result.find((m) => m.period === "2025-9M")).toBeDefined();
  });

  it("does NOT derive if standalone already exists", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
      makeMetric({ period: "2025-Q2", metricName: "driftsinntekter", value: 200 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2s = result.filter((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    expect(q2s).toHaveLength(1);
    expect(q2s[0].source).toBe("extracted");
  });

  it("does NOT subtract balance sheet metrics", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "sum_eiendeler", value: 500, category: "balanse" }),
      makeMetric({ period: "2025-H1", metricName: "sum_eiendeler", value: 800, category: "balanse" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "sum_eiendeler");
    expect(q2).toBeUndefined();
  });

  it("does NOT subtract percentage metrics", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsmargin", value: 15, category: "nøkkeltall", unit: "%" }),
      makeMetric({ period: "2025-H1", metricName: "driftsmargin", value: 20, category: "nøkkeltall", unit: "%" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsmargin");
    expect(q2).toBeUndefined();
  });

  it("does NOT subtract EPS", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "resultat_per_aksje", value: 0.1 }),
      makeMetric({ period: "2025-H1", metricName: "resultat_per_aksje", value: 0.48 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "resultat_per_aksje");
    expect(q2).toBeUndefined();
  });

  it("returns null when prerequisite is missing", () => {
    const metrics = [
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 300 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2");
    expect(q2).toBeUndefined();
  });

  it("skips derivation when result would be negative for revenue", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 400 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 300 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    expect(q2).toBeUndefined();
  });

  it("refuses to derive when units don't match", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100, unit: "MNOK" }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350, unit: "MEUR" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2");
    expect(q2).toBeUndefined();
  });

  it("handles full Cadeler-style derivation chain", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 82 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 299 }),
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 453 }),
      makeMetric({ period: "2025-FY", metricName: "driftsinntekter", value: 600 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2 = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsinntekter");
    const q3 = result.find((m) => m.period === "2025-Q3" && m.metricName === "driftsinntekter");
    const q4 = result.find((m) => m.period === "2025-Q4" && m.metricName === "driftsinntekter");
    expect(q2!.value).toBe(217);
    expect(q3!.value).toBe(154);
    expect(q4!.value).toBe(147);
    // H1 and 9M hidden, FY stays visible as annual figure
    expect(result.find((m) => m.period === "2025-H1")).toBeUndefined();
    expect(result.find((m) => m.period === "2025-9M")).toBeUndefined();
    expect(result.find((m) => m.period === "2025-FY")).toBeDefined();
  });

  it("remaps balance sheet from cumulative to standalone quarter", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
      makeMetric({ period: "2025-H1", metricName: "sum_eiendeler", value: 800, category: "balanse" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    // H1 balance sheet should be remapped to Q2
    const q2Assets = result.find((m) => m.period === "2025-Q2" && m.metricName === "sum_eiendeler");
    expect(q2Assets).toBeDefined();
    expect(q2Assets!.value).toBe(800);
    // H1 period should be hidden
    expect(result.find((m) => m.period === "2025-H1")).toBeUndefined();
  });

  it("keeps FY visible for all years, even when Q4 is derived", () => {
    const metrics = [
      makeMetric({ period: "2024-9M", metricName: "driftsinntekter", value: 450 }),
      makeMetric({ period: "2024-FY", metricName: "driftsinntekter", value: 600 }),
      makeMetric({ period: "2023-FY", metricName: "driftsinntekter", value: 500 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    // 2024: Q4 derived, FY still visible
    expect(result.find((m) => m.period === "2024-Q4" && m.metricName === "driftsinntekter")).toBeDefined();
    expect(result.find((m) => m.period === "2024-FY")).toBeDefined();
    // 2023: FY visible — no quarterly data
    const fy2023 = result.find((m) => m.period === "2023-FY" && m.metricName === "driftsinntekter");
    expect(fy2023).toBeDefined();
    expect(fy2023!.value).toBe(500);
  });

  it("passes through extracted metrics unchanged", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q1 = result.find((m) => m.period === "2025-Q1");
    expect(q1!.source).toBe("extracted");
  });

  it("recomputes margins for derived quarters", () => {
    const metrics = [
      makeMetric({ period: "2025-Q1", metricName: "driftsinntekter", value: 100 }),
      makeMetric({ period: "2025-Q1", metricName: "driftsresultat", value: 20 }),
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 350 }),
      makeMetric({ period: "2025-H1", metricName: "driftsresultat", value: 80 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q2Margin = result.find((m) => m.period === "2025-Q2" && m.metricName === "driftsmargin");
    expect(q2Margin).toBeDefined();
    // Q2 revenue = 250, Q2 operating profit = 60, margin = 24%
    expect(q2Margin!.value).toBe(24);
    expect(q2Margin!.source).toBe("derived");
  });

  it("derived margin operands include upstream source documentIds", () => {
    // Q4 margin is computed from Q4 revenue and Q4 profit, both derived from FY-9M.
    // The margin's operands must include the 9M doc so filtering works correctly.
    const metrics = [
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450, documentId: "doc_9m" }),
      makeMetric({ period: "2025-9M", metricName: "driftsresultat", value: 100, documentId: "doc_9m" }),
      makeMetric({ period: "2025-FY", metricName: "driftsinntekter", value: 600, documentId: "doc_fy" }),
      makeMetric({ period: "2025-FY", metricName: "driftsresultat", value: 150, documentId: "doc_fy" }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q4Margin = result.find((m) => m.period === "2025-Q4" && m.metricName === "driftsmargin");
    expect(q4Margin).toBeDefined();
    // Must reference both FY and 9M docs so the filter can exclude it
    // when only annual reports are selected
    const opDocIds = q4Margin!.derivation!.operands.map((o) => o.documentId);
    expect(opDocIds).toContain("doc_fy");
    expect(opDocIds).toContain("doc_9m");
  });
});
