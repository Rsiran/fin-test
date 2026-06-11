import { describe, it, expect } from "vitest";
import { deduplicateMarkdown } from "../lib/markdown-dedup";

describe("deduplicateMarkdown", () => {
  describe("page splitting", () => {
    it("returns input unchanged when no page markers exist", () => {
      const input = "# Some heading\n\nSome content\n";
      expect(deduplicateMarkdown(input)).toBe(input);
    });

    it("preserves content with page markers but no issues", () => {
      const input = [
        "# Revenue Report",
        "---",
        "<!-- PAGE 1 -->",
        "Some unique content on page 1",
        "---",
        "<!-- PAGE 2 -->",
        "Completely different content on page 2",
      ].join("\n");
      const result = deduplicateMarkdown(input);
      expect(result).toContain("content on page 1");
      expect(result).toContain("content on page 2");
    });
  });

  describe("deduplication", () => {
    it("removes duplicate pages with >80% line overlap", () => {
      const sharedLines = Array.from(
        { length: 10 },
        (_, i) => `| Row ${i} | ${i * 100} | ${i * 90} |`
      ).join("\n");

      const input = [
        "---",
        "<!-- PAGE 1 -->",
        "# Resultatregnskap\n",
        sharedLines,
        "\n---",
        "<!-- PAGE 2 -->",
        "# Resultatregnskap\n",
        sharedLines,
        "\n| Extra row | 999 | 888 |",
      ].join("\n");

      const result = deduplicateMarkdown(input);
      expect(result).toContain("Extra row");
      const matches = result.match(/Row 0/g);
      expect(matches).toHaveLength(1);
    });

    it("does not deduplicate pages with <80% overlap", () => {
      const input = [
        "---",
        "<!-- PAGE 1 -->",
        "# Resultatregnskap\n",
        "| Revenue | 1000 |",
        "\n---",
        "<!-- PAGE 2 -->",
        "# Balanse\n",
        "| Total assets | 5000 |",
      ].join("\n");

      const result = deduplicateMarkdown(input);
      expect(result).toContain("Revenue");
      expect(result).toContain("Total assets");
    });
  });

  describe("deinterleaving", () => {
    it("separates interleaved P&L and balance sheet rows", () => {
      const input = [
        "---",
        "<!-- PAGE 1 -->",
        "| Driftsinntekter | 1000 | 900 |",
        "| Sum eiendeler | 5000 | 4500 |",
        "| Varekostnad | 400 | 350 |",
        "| Egenkapital | 2000 | 1800 |",
        "| Driftsresultat | 200 | 180 |",
        "| Total gjeld | 3000 | 2700 |",
      ].join("\n");

      const result = deduplicateMarkdown(input);
      const lines = result.split("\n").filter((l) => l.trim().length > 0);

      const revenueIdx = lines.findIndex((l) => l.includes("Driftsinntekter"));
      const cogsIdx = lines.findIndex((l) => l.includes("Varekostnad"));
      const ebitIdx = lines.findIndex((l) => l.includes("Driftsresultat"));
      const assetsIdx = lines.findIndex((l) => l.includes("Sum eiendeler"));
      const equityIdx = lines.findIndex((l) => l.includes("Egenkapital"));
      const debtIdx = lines.findIndex((l) => l.includes("Total gjeld"));

      // P&L rows grouped together
      expect(revenueIdx).toBeLessThan(cogsIdx);
      expect(cogsIdx).toBeLessThan(ebitIdx);

      // BS rows grouped together
      expect(assetsIdx).toBeLessThan(equityIdx);
      expect(equityIdx).toBeLessThan(debtIdx);

      // P&L block before BS block (canonical order)
      expect(ebitIdx).toBeLessThan(assetsIdx);
    });

    it("skips deinterleaving when confidence is below 60%", () => {
      const input = [
        "---",
        "<!-- PAGE 1 -->",
        "| Random A | 100 |",
        "| Random B | 200 |",
        "| Random C | 300 |",
        "| Driftsinntekter | 1000 |",
        "| Random D | 400 |",
        "| Random E | 500 |",
        "| Random F | 600 |",
        "| Egenkapital | 2000 |",
        "| Random G | 700 |",
      ].join("\n");

      const result = deduplicateMarkdown(input);
      // With only 2 out of 9 non-empty lines classified (22%), should skip
      // Output should preserve original order
      const lines = result.split("\n").filter((l) => l.includes("|"));
      expect(lines[0]).toContain("Random A");
      expect(lines[3]).toContain("Driftsinntekter");
      expect(lines[7]).toContain("Egenkapital");
    });

    it("does not scramble a pure cash-flow page (kontanter is not balance sheet)", () => {
      // "Netto endring i kontanter" contains the BS keyword "kontanter";
      // if classified as balance_sheet the page looks interleaved and the
      // closing row gets moved above the heading.
      const input = [
        "---",
        "<!-- PAGE 1 -->",
        "## Oppstilling over kontantstrømmer",
        "| Kontantstrøm fra driftsaktiviteter | 2900 |",
        "| Kontantstrøm fra investeringsaktiviteter | -1200 |",
        "| Kontantstrøm fra finansieringsaktiviteter | -1100 |",
        "| Netto endring i kontanter | 600 |",
      ].join("\n");

      const result = deduplicateMarkdown(input);
      const lines = result.split("\n").filter((l) => l.trim().length > 0);
      const headingIdx = lines.findIndex((l) => l.includes("Oppstilling over kontantstrømmer"));
      const netChangeIdx = lines.findIndex((l) => l.includes("Netto endring i kontanter"));
      expect(headingIdx).toBeLessThan(netChangeIdx);
      expect(netChangeIdx).toBe(lines.length - 1);
    });

    it("handles pages with only one statement type (no-op)", () => {
      const input = [
        "---",
        "<!-- PAGE 1 -->",
        "# Resultatregnskap",
        "| Driftsinntekter | 1000 |",
        "| Varekostnad | 400 |",
        "| Driftsresultat | 200 |",
      ].join("\n");

      const result = deduplicateMarkdown(input);
      expect(result).toContain("Driftsinntekter");
      expect(result).toContain("Varekostnad");
      expect(result).toContain("Driftsresultat");
    });
  });
});
