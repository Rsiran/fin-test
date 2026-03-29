import { describe, it, expect } from "vitest";
import { validateMetrics, prepareStructuredInput, type ExtractedMetric } from "../lib/financial-extractor";

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

const REACH_SUBSEA_EXCERPT = `
## Key figures

| |4Q 2023|4Q 2022|12M 2023|12M 2022|
|---|---|---|---|---|
|Revenue (NOKm)|474|327|1 996|1 163|
|EBIT (NOKm)|80|35|332|105|
|Equity (NOKm)|928|579|928|579|

## Income statement

|Statement of profit or loss (NOK 1000)|Q4 2023|Q4 2022|12M 2023|12M 2022|Notes|
|---|---|---|---|---|---|
|Revenue|474 138|327 413|1 995 903|1 162 821| |
|EBITDA|212 180|119 897|954 790|458 787| |
|Operating result (EBIT)|79 522|34 648|331 786|105 255| |

#### Balance Sheet

|Statement of financial position (NOK 1000)|31.12.2023|31.12.2022|Notes|
|---|---|---|---|
|Total assets|2 692 632|952 085| |
|Total equity|928 005|579 442| |

#### Cash flow

|Statement of cash flows (NOK 1000)|Q4 2023|Q4 2022|12M 2023|12M 2022|
|---|---|---|---|---|
|Cash from operating activities|547 639|120 497|1 053 715|293 261| |
`;

describe("prepareStructuredInput", () => {
  it("excludes key figures summary and includes financial statements", () => {
    const result = prepareStructuredInput(REACH_SUBSEA_EXCERPT).content;
    expect(result).toContain("EBITDA");
    expect(result).toContain("212180");
    expect(result).not.toContain("Revenue (NOKm)");
    expect(result).toContain("BALANCE SHEET");
    expect(result).toContain("CASH FLOW");
  });

  it("includes unit context", () => {
    const result = prepareStructuredInput(REACH_SUBSEA_EXCERPT).content;
    expect(result).toContain("thousands");
  });

  it("collapses space-separated numbers in table values", () => {
    const md = `
## Income statement

|Statement of profit or loss (NOK 1000)|Q4 2023|
|---|---|
|Revenue|1 338 842|
|EBITDA|212 180|
`;
    const result = prepareStructuredInput(md).content;
    expect(result).toContain("1338842");
    expect(result).not.toContain("1 338 842");
    expect(result).toContain("212180");
  });

  it("preserves spaces in fallback path (no pipe tables)", () => {
    // This markdown has NO pipe-delimited tables — triggers fallback
    const md = `
## Income statement

(NOK million) 2025 2024 Operating revenues 2015 1916 EBITDA 394 332
`;
    const result = prepareStructuredInput(md).content;
    // Spaces between separate values must be preserved
    expect(result).toContain("2015 1916");
    expect(result).toContain("394 332");
  });

  it("still strips commas in fallback path", () => {
    const md = `
## Income statement

EUR'000 2023 2022 Revenue 108,622 106,424 Cost of sales (59,858) (49,537)
`;
    const result = prepareStructuredInput(md).content;
    expect(result).toContain("108622");
    expect(result).toContain("106424");
    expect(result).not.toContain("108,622");
  });

  it("does not collapse spaces in non-numeric contexts", () => {
    const md = `
## Income statement

|Statement of profit or loss (NOK 1000)|Q4 2023|12M 2025|
|---|---|---|
|Revenue|474 138|1 995 903|
`;
    const result = prepareStructuredInput(md).content;
    expect(result).toContain("474138");
    expect(result).toContain("1995903");
    // "Q4 2023" should not be collapsed (not a digit-space-3digits pattern)
    expect(result).toContain("Q4 2023");
  });
});
