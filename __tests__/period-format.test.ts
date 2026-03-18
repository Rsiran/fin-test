import { describe, it, expect } from "vitest";
import { canonicalizePeriod } from "../lib/period-format";

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
