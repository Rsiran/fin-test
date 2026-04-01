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

  const pages = splitByPages(markdown);
  return reassemble(pages);
}
