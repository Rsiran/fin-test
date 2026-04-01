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
});
