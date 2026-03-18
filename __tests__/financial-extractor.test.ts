import { describe, it, expect } from "vitest";
import { validateMetrics, type ExtractedMetric } from "../lib/financial-extractor";

describe("validateMetrics", () => {
  it("accepts valid metrics", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "driftsinntekter", value: 342.8, unit: "MNOK", category: "resultat", confidence: "high" },
      { metricName: "driftsmargin", value: 26.0, unit: "%", category: "nøkkeltall", confidence: "high" },
    ];
    const result = validateMetrics(metrics);
    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects negative revenue", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "driftsinntekter", value: -100, unit: "MNOK", category: "resultat", confidence: "high" },
    ];
    const result = validateMetrics(metrics);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects margins outside -100% to 100%", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "driftsmargin", value: 150, unit: "%", category: "nøkkeltall", confidence: "high" },
    ];
    const result = validateMetrics(metrics);
    expect(result.rejected).toHaveLength(1);
  });

  it("flags low-confidence metrics", () => {
    const metrics: ExtractedMetric[] = [
      { metricName: "ebitda", value: 89.2, unit: "MNOK", category: "resultat", confidence: "low" },
    ];
    const result = validateMetrics(metrics);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].flagged).toBe(true);
  });
});
