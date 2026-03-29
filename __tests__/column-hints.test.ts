import { describe, it, expect } from "vitest";
import { detectColumnHints } from "../lib/column-hints";

describe("detectColumnHints", () => {
  it("detects column count from data rows", () => {
    const md = `## Income statement

Second quarter Year to date Year

(NOK million) 2025 2024 2025 2024 2024
Operating revenues 1,694 1,709 3,212 3,234 6,385
EBITDA 583 465 997 796 1,632`;
    const hint = detectColumnHints(md, false);
    expect(hint).not.toBeNull();
    expect(hint).toContain("5");
    expect(hint).toContain("FIRST column");
  });

  it("returns null when structured path was used", () => {
    const md = `Some content`;
    const hint = detectColumnHints(md, true);
    expect(hint).toBeNull();
  });

  it("returns null when no data rows found", () => {
    const md = `Just some text about the company.
No financial data here.`;
    const hint = detectColumnHints(md, false);
    expect(hint).toBeNull();
  });

  it("handles negative numbers in parentheses", () => {
    const md = `## Income statement

(NOK million) 2025 2024
Operating revenues 1,694 1,709
Costs (139) (149)`;
    const hint = detectColumnHints(md, false);
    expect(hint).not.toBeNull();
    expect(hint).toContain("2");
  });
});
