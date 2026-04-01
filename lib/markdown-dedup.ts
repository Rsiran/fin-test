interface Page {
  pageNumber: number;
  content: string;
}

const PAGE_MARKER_RE = /<!-- PAGE (\d+) -->/;

function splitByPages(markdown: string): Page[] {
  const parts = markdown.split(/---\n<!-- PAGE (\d+) -->\n/);
  if (parts.length < 3) {
    return [{ pageNumber: 0, content: markdown }];
  }

  const pages: Page[] = [];
  const preamble = parts[0].trim();
  if (preamble) {
    pages.push({ pageNumber: 0, content: preamble });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const pageNumber = parseInt(parts[i], 10);
    const content = parts[i + 1] ?? "";
    pages.push({ pageNumber, content });
  }

  return pages;
}

function normalizeLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((line) => setB.has(line)).length;
  return shared / Math.min(a.length, b.length);
}

function deduplicatePages(pages: Page[]): Page[] {
  const dominated = new Set<number>();

  for (let i = 0; i < pages.length; i++) {
    if (dominated.has(i)) continue;
    const linesI = normalizeLines(pages[i].content);

    for (let j = i + 1; j < pages.length; j++) {
      if (dominated.has(j)) continue;
      const linesJ = normalizeLines(pages[j].content);

      if (overlapRatio(linesI, linesJ) > 0.8) {
        if (linesI.length >= linesJ.length) {
          dominated.add(j);
        } else {
          dominated.add(i);
          break;
        }
      }
    }
  }

  return pages.filter((_, idx) => !dominated.has(idx));
}

function reassemble(pages: Page[]): string {
  return pages
    .map((p) =>
      p.pageNumber === 0
        ? p.content
        : `---\n<!-- PAGE ${p.pageNumber} -->\n${p.content}`
    )
    .join("");
}

export function deduplicateMarkdown(markdown: string): string {
  if (!PAGE_MARKER_RE.test(markdown)) {
    return markdown;
  }

  let pages = splitByPages(markdown);
  pages = deduplicatePages(pages);
  return reassemble(pages);
}
