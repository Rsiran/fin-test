import { describe, it, expect } from "vitest";
import { canonicalizePeriod, periodToFileName, sortPeriods } from "../lib/period-format";

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

  it("parses nine-month formats", () => {
    expect(canonicalizePeriod("9M 2025")).toBe("2025-9M");
    expect(canonicalizePeriod("9m 2025")).toBe("2025-9M");
    expect(canonicalizePeriod("9M2025")).toBe("2025-9M");
  });

  it("handles digit-Q-year format (1Q 2025)", () => {
    expect(canonicalizePeriod("1Q 2025")).toBe("2025-Q1");
    expect(canonicalizePeriod("4Q 2025")).toBe("2025-Q4");
    expect(canonicalizePeriod("2Q2024")).toBe("2024-Q2");
  });

  it("handles 6M format", () => {
    expect(canonicalizePeriod("6M 2024")).toBe("2024-H1");
    expect(canonicalizePeriod("6m2025")).toBe("2025-H1");
  });

  it("handles 12M format", () => {
    expect(canonicalizePeriod("12M 2024")).toBe("2024-FY");
    expect(canonicalizePeriod("12m 2023")).toBe("2023-FY");
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

  it("converts nine-month periods", () => {
    expect(periodToFileName("2025-9M")).toBe("9M25");
    expect(periodToFileName("2024-9M")).toBe("9M24");
  });

  it("returns null for unrecognized formats", () => {
    expect(periodToFileName("unknown")).toBeNull();
    expect(periodToFileName("2024")).toBeNull();
    expect(periodToFileName("Q1 2025")).toBeNull();
  });

  it("round-trips through canonicalizePeriod", () => {
    expect(periodToFileName(canonicalizePeriod("Q2 2024"))).toBe("2Q24");
    expect(periodToFileName(canonicalizePeriod("Årsrapport 2024"))).toBe("AR24");
    expect(periodToFileName(canonicalizePeriod("H1 2025"))).toBe("H125");
  });

  it("round-trips 9M through canonicalizePeriod", () => {
    expect(periodToFileName(canonicalizePeriod("9M 2025"))).toBe("9M25");
  });
});

describe("sortPeriods", () => {
  it("sorts periods in chronological order", () => {
    const input = ["2025-FY", "2025-Q1", "2025-9M", "2025-H1", "2025-Q3"];
    expect(sortPeriods(input)).toEqual([
      "2025-Q1", "2025-H1", "2025-Q3", "2025-9M", "2025-FY",
    ]);
  });

  it("sorts across years", () => {
    const input = ["2025-Q1", "2024-FY", "2024-Q3", "2025-H1"];
    expect(sortPeriods(input)).toEqual([
      "2024-Q3", "2024-FY", "2025-Q1", "2025-H1",
    ]);
  });

  it("handles Q2 and Q4 in the order", () => {
    const input = ["2025-Q4", "2025-Q2", "2025-Q1", "2025-Q3"];
    expect(sortPeriods(input)).toEqual([
      "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4",
    ]);
  });
});
