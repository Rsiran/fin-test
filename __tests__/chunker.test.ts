import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "../lib/chunker";

describe("chunkMarkdown", () => {
  it("splits on headings", () => {
    const md = "# Section 1\n\nContent one.\n\n# Section 2\n\nContent two.";
    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBe(2);
    expect(chunks[0].content).toContain("Section 1");
    expect(chunks[1].content).toContain("Section 2");
  });

  it("keeps tables as whole chunks", () => {
    const md = "# Data\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nMore text.";
    const chunks = chunkMarkdown(md);
    const tableChunk = chunks.find((c) => c.content.includes("| A |"));
    expect(tableChunk).toBeDefined();
    expect(tableChunk!.content).toContain("| 3 | 4 |");
  });

  it("assigns sequential chunk indices", () => {
    const md = "# A\n\nText A\n\n# B\n\nText B\n\n# C\n\nText C";
    const chunks = chunkMarkdown(md);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("handles empty input", () => {
    const chunks = chunkMarkdown("");
    expect(chunks).toEqual([]);
  });
});
