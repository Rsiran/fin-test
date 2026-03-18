import { convert } from "@opendataloader/pdf";
import { writeFile, readFile, mkdtemp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Convert a PDF buffer to markdown text.
 * Uses opendataloader-pdf JS API with image extraction disabled.
 * Falls back to pdf-parse (plain text) if opendataloader fails.
 */
export async function convertPdfToMarkdown(pdfBuffer: Buffer): Promise<string> {
  const result = await tryOpenDataLoader(pdfBuffer);
  if (result) return result;

  console.warn("opendataloader-pdf failed, falling back to pdf-parse");
  return await fallbackPdfParse(pdfBuffer);
}

async function tryOpenDataLoader(pdfBuffer: Buffer): Promise<string | null> {
  const tempDir = await mkdtemp(join(tmpdir(), "finansanalyse-"));
  const inputPath = join(tempDir, "input.pdf");
  const outputDir = join(tempDir, "output");

  try {
    await writeFile(inputPath, pdfBuffer);

    await convert([inputPath], {
      outputDir,
      format: "markdown",
      imageOutput: "off",
      quiet: true,
    });

    // Read the generated markdown file
    const files = await readdir(outputDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) return null;

    const content = await readFile(join(outputDir, mdFile), "utf-8");
    return content.length > 0 ? content : null;
  } catch (error) {
    console.warn("opendataloader-pdf error:", error instanceof Error ? error.message : error);
    return null;
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
