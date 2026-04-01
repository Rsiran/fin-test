import { convert } from "@opendataloader/pdf";
import { writeFile, readFile, mkdtemp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Override JVM heap for opendataloader-pdf's Java subprocess.
// Works in both local dev and Docker (Dockerfile also sets this).
process.env._JAVA_OPTIONS = "-Xmx4g";

/**
 * Convert a PDF buffer to markdown text using opendataloader-pdf.
 */
export async function convertPdfToMarkdown(pdfBuffer: Buffer): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "finansanalyse-"));
  const inputPath = join(tempDir, "input.pdf");
  const outputDir = join(tempDir, "output");

  try {
    await writeFile(inputPath, pdfBuffer);

    await convert([inputPath], {
      outputDir,
      format: "markdown",
      imageOutput: "off",
      contentSafetyOff: "hidden-text",
      markdownPageSeparator: "---\n<!-- PAGE %page-number% -->\n",
      ...(process.env.DOCLING_SERVE_URL && {
        hybrid: "docling-fast",
        hybridUrl: process.env.DOCLING_SERVE_URL,
        hybridTimeout: "120000",
        hybridFallback: true,
        ...(process.env.__HYBRID_MODE_OVERRIDE && {
          hybridMode: process.env.__HYBRID_MODE_OVERRIDE,
        }),
      }),
      quiet: true,
    });

    const files = await readdir(outputDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) throw new Error("opendataloader produced no markdown output");

    const content = await readFile(join(outputDir, mdFile), "utf-8");
    if (content.length === 0) throw new Error("opendataloader produced empty markdown");

    return content;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
