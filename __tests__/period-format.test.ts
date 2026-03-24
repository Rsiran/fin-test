import { describe, it, expect } from "vitest";
import { canonicalizePeriod, periodToFileName } from "../lib/period-format";

describe("canonicalizePeriod", () => {
  it("parses quarterly formats", () => {
    expect(canonicalizePeriod("Q1 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("Q4 2024")).toBe("2024-Q4");
    expect(canonicalizePeriod("1. kvartal 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("første kvartal 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("tredje kvartal 2024")).toBe("2024-Q3");
  });

  it("parses annual formats", () => {
    expect(canonicalizePeriod("FY 2024")).toBe("2024-FY");
    expect(canonicalizePeriod("Årsrapport 2024")).toBe("2024-FY");
    expect(canonicalizePeriod("2024")).toBe("2024-FY");
  });

  it("parses half-year formats", () => {
    expect(canonicalizePeriod("H1 2025")).toBe("2025-H1");
    expect(canonicalizePeriod("halvårsrapport 2025")).toBe("2025-H1");
  });

  it("returns input unchanged if unrecognized", () => {
    expect(canonicalizePeriod("unknown format")).toBe("unknown format");
  });
});

describe("periodToFileName", () => {
  it("converts quarterly periods", () => {
    expect(periodToFileName("2024-Q1")).toBe("1Q24");
    expect(periodToFileName("2024-Q2")).toBe("2Q24");
    expect(periodToFileName("2025-Q3")).toBe("3Q25");
    expect(periodToFileName("2023-Q4")).toBe("4Q23");
  });

  it("converts annual periods", () => {
    expect(periodToFileName("2024-FY")).toBe("AR24");
    expect(periodToFileName("2023-FY")).toBe("AR23");
  });

  it("converts half-year periods", () => {
    expect(periodToFileName("2025-H1")).toBe("H125");
    expect(periodToFileName("2024-H2")).toBe("H224");
  });

  it("returns null for unrecognized formats", () => {
    expect(periodToFileName("unknown")).toBeNull();
    expect(periodToFileName("2024")).toBeNull();
    expect(periodToFileName("Q1 2025")).toBeNull();
  });
});
