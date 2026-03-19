import { describe, it, expect } from "vitest";
import { validateMetrics, extractFinancialSections, type ExtractedMetric } from "../lib/financial-extractor";

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

describe("extractFinancialSections", () => {
  it("returns short documents unchanged", () => {
    const md = "# Report\n\nSmall document.";
    expect(extractFinancialSections(md)).toBe(md);
  });

  it("prioritizes sections with financial keywords", () => {
    // Build a doc where financial sections are buried deep
    const filler = Array.from({ length: 50 }, (_, i) =>
      `# Chapter ${i}\n\n${"Lorem ipsum dolor sit amet. ".repeat(100)}`
    ).join("\n\n");
    const financial = "# Resultatregnskap\n\n| Driftsinntekter | 500 MNOK |\n|---|---|\n| EBITDA | 120 MNOK |";
    const bigDoc = filler + "\n\n" + financial;

    const result = extractFinancialSections(bigDoc, 5000);
    expect(result).toContain("Resultatregnskap");
    expect(result).toContain("Driftsinntekter");
    expect(result.length).toBeLessThan(5000);
  });

  it("preserves original document order of selected sections", () => {
    const doc = "# Intro\n\nWelcome.\n\n# Balanse\n\nSum eiendeler: 1000 MNOK\n\n# Notes\n\nDetails.\n\n# Kontantstrøm\n\nOperasjonelle aktiviteter: 200 MNOK";
    const result = extractFinancialSections(doc, 500);
    const balanseIdx = result.indexOf("Balanse");
    const kontantIdx = result.indexOf("Kontantstrøm");
    // Balanse should appear before Kontantstrøm (original order)
    if (balanseIdx !== -1 && kontantIdx !== -1) {
      expect(balanseIdx).toBeLessThan(kontantIdx);
    }
  });
});
