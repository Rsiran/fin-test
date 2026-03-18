export interface Chunk {
  content: string;
  chunkIndex: number;
}

const MAX_CHUNK_TOKENS = 1000;
const OVERLAP_TOKENS = 200;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

export function chunkMarkdown(markdown: string): Chunk[] {
  if (!markdown.trim()) return [];

  const sections = splitOnHeadings(markdown);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    if (section.length <= MAX_CHARS) {
      chunks.push({ content: section.trim(), chunkIndex: index++ });
    } else {
      const subChunks = splitLargeSection(section);
      for (const sub of subChunks) {
        chunks.push({ content: sub.trim(), chunkIndex: index++ });
      }
    }
  }

  return chunks;
}

function splitOnHeadings(markdown: string): string[] {
  const parts = markdown.split(/(?=^#{1,3}\s)/m);
  return parts.filter((p) => p.trim().length > 0);
}

function splitLargeSection(section: string): string[] {
  const paragraphs = section.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > MAX_CHARS && current.length > 0) {
      chunks.push(current);
      const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;
      const overlap = current.slice(-overlapChars);
      current = overlap + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}
