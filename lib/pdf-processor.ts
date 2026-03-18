import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

/**
 * Convert a PDF buffer to markdown text.
 * Tries opendataloader-pdf first (preserves structure, tables, headings).
 * Falls back to pdf-parse (plain text) if opendataloader crashes.
 */
export async function convertPdfToMarkdown(pdfBuffer: Buffer): Promise<string> {
  // Try opendataloader-pdf first — best quality
  const result = await tryOpenDataLoader(pdfBuffer);
  if (result) return result;

  // Fallback to pdf-parse — always works, less structure
  console.warn("opendataloader-pdf failed, falling back to pdf-parse");
  return await fallbackPdfParse(pdfBuffer);
}

async function tryOpenDataLoader(pdfBuffer: Buffer): Promise<string | null> {
  const tempDir = await mkdtemp(join(tmpdir(), "finansanalyse-"));
  const inputPath = join(tempDir, "input.pdf");
  const outputDir = join(tempDir, "output");

  try {
    await writeFile(inputPath, pdfBuffer);
    await mkdir(outputDir, { recursive: true });

    try {
      await execFileAsync("npx", [
        "@opendataloader/pdf",
        inputPath,
        "-o", outputDir,
        "-f", "markdown",
        "--content-safety-off", "all",
      ], {
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch {
      // Check if markdown was generated before the crash
      const mdContent = await tryReadMarkdown(outputDir);
      if (mdContent) {
        console.warn("opendataloader-pdf crashed but markdown was recovered");
        return mdContent;
      }
      return null;
    }

    return await tryReadMarkdown(outputDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fallbackPdfParse(pdfBuffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(pdfBuffer);
  return data.text;
}

async function tryReadMarkdown(outputDir: string): Promise<string | null> {
  try {
    const files = await readdir(outputDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) return null;
    const content = await readFile(join(outputDir, mdFile), "utf-8");
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}
