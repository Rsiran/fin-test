import { describe, it, expect } from "vitest";
import { scoreExtraction } from "../lib/quality-scorer";
import { type ExtractedMetric } from "../lib/financial-extractor";

function metric(name: string, value: number, unit = "MNOK"): ExtractedMetric {
  return { metricName: name, value, unit, category: "resultat", confidence: "high" };
}

describe("scoreExtraction", () => {
  it("scores a complete extraction highly", () => {
    const metrics = [
      metric("driftsinntekter", 606),
      metric("driftsresultat", 80),
      metric("ebitda", 212),
      metric("aarsresultat", 57),
      metric("sum_eiendeler", 2692),
      metric("egenkapital", 928),
      metric("total_gjeld", 1764),
      metric("operasjonell_kontantstrom", 547),
    ];
    const result = scoreExtraction(metrics, "some input", true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.missing).toHaveLength(0);
  });

  it("scores a sparse extraction low", () => {
    const metrics = [
      metric("driftsinntekter", 1694),
      metric("ebitda", 583),
    ];
    const result = scoreExtraction(metrics, "some input", true);
    expect(result.score).toBeLessThan(60);
  });

  it("detects missing metrics present in input", () => {
    const metrics = [
      metric("driftsinntekter", 606),
    ];
    const input = "EBITDA|212 180|\nTotal assets|2 692 632|";
    const result = scoreExtraction(metrics, input, true);
    expect(result.missing).toContain("ebitda");
    expect(result.missing).toContain("sum_eiendeler");
    expect(result.score).toBeLessThan(60);
  });

  it("penalizes balance sheet 1000x off", () => {
    const metrics = [
      metric("driftsinntekter", 606),
      metric("driftsresultat", 80),
      metric("ebitda", 212),
      metric("aarsresultat", 57),
      metric("sum_eiendeler", 1.2),
      metric("egenkapital", 928),
      metric("total_gjeld", 270),
      metric("operasjonell_kontantstrom", 547),
    ];
    const result = scoreExtraction(metrics, "input", true);
    expect(result.balanceSheetValid).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining("balance sheet"));
  });

  it("validates balance sheet identity within 20%", () => {
    const metrics = [
      metric("sum_eiendeler", 2692),
      metric("egenkapital", 928),
      metric("total_gjeld", 1764),
    ];
    const result = scoreExtraction(metrics, "input", true);
    expect(result.balanceSheetValid).toBe(true);
  });

  it("gives bonus for structured path", () => {
    const metrics = [metric("driftsinntekter", 606)];
    const structured = scoreExtraction(metrics, "input", true);
    const fallback = scoreExtraction(metrics, "input", false);
    expect(structured.score).toBeGreaterThan(fallback.score);
  });

  it("returns score 0 for empty metrics", () => {
    const result = scoreExtraction([], "input with revenue", true);
    expect(result.score).toBeLessThanOrEqual(0);
  });
});
