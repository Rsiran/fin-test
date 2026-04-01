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
});
