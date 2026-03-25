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
  it("derives Q2 from H1 and Q1", () => {
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
  });

  it("derives Q3 from 9M and H1", () => {
    const metrics = [
      makeMetric({ period: "2025-H1", metricName: "driftsinntekter", value: 300 }),
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q3 = result.find((m) => m.period === "2025-Q3" && m.metricName === "driftsinntekter");
    expect(q3).toBeDefined();
    expect(q3!.value).toBe(150);
  });

  it("derives Q4 from FY and 9M", () => {
    const metrics = [
      makeMetric({ period: "2025-9M", metricName: "driftsinntekter", value: 450 }),
      makeMetric({ period: "2025-FY", metricName: "driftsinntekter", value: 600 }),
    ];
    const result = deriveStandaloneQuarters(metrics);
    const q4 = result.find((m) => m.period === "2025-Q4" && m.metricName === "driftsinntekter");
    expect(q4).toBeDefined();
    expect(q4!.value).toBe(150);
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
});
