import { describe, it, expect } from "vitest";
import { pickBestResult } from "../lib/extraction-orchestrator";
import { type ExtractionResult, type ExtractedMetric } from "../lib/financial-extractor";
import { type QualityScore } from "../lib/quality-scorer";

function metric(name: string, value: number): ExtractedMetric {
  return { metricName: name, value, unit: "MNOK", category: "resultat", confidence: "high" };
}

function makeResult(metrics: ExtractedMetric[], score: number): { result: ExtractionResult; quality: QualityScore } {
  return {
    result: {
      period: "2025-Q2",
      reportType: "kvartalsrapport",
      metrics,
    },
    quality: {
      score,
      missing: [],
      warnings: [],
      usedStructuredPath: true,
      balanceSheetValid: true,
    },
  };
}

describe("pickBestResult", () => {
  it("picks the result with the highest score", () => {
    const attempts = [
      makeResult([metric("driftsinntekter", 100)], 30),
      makeResult([metric("driftsinntekter", 100), metric("ebitda", 50)], 50),
      makeResult([metric("driftsinntekter", 100), metric("ebitda", 50), metric("aarsresultat", 20)], 70),
    ];
    const best = pickBestResult(attempts);
    expect(best.quality.score).toBe(70);
    expect(best.result.metrics).toHaveLength(3);
  });

  it("returns the only result if just one attempt", () => {
    const attempts = [makeResult([metric("driftsinntekter", 100)], 30)];
    const best = pickBestResult(attempts);
    expect(best.quality.score).toBe(30);
  });
});
