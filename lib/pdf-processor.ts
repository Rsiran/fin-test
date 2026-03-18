import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export async function convertPdfToMarkdown(pdfBuffer: Buffer): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "finansanalyse-"));
  const inputPath = join(tempDir, "input.pdf");
  const outputDir = join(tempDir, "output");

  try {
    await writeFile(inputPath, pdfBuffer);
    await mkdir(outputDir, { recursive: true });

    // opendataloader-pdf may crash on image extraction (RasterFormatException)
    // even when outputting plain markdown. The text is usually written before
    // the crash, so we check for output regardless of exit code.
    try {
      await execFileAsync("npx", [
        "@opendataloader/pdf",
        inputPath,
        "-o", outputDir,
        "-f", "markdown",
        "-q",
      ], {
        timeout: 300000, // 5 min for large PDFs
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (execError: any) {
      // Check if markdown was generated despite the error
      const files = await readdir(outputDir).catch(() => []);
      const mdFile = files.find((f: string) => f.endsWith(".md"));
      if (mdFile) {
        const content = await readFile(join(outputDir, mdFile), "utf-8");
        if (content.length > 0) {
          console.warn("opendataloader-pdf exited with error but markdown was generated, using partial output");
          return content;
        }
      }
      // No usable output — re-throw
      throw execError;
    }

    const files = await readdir(outputDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) throw new Error("No markdown output generated");

    return await readFile(join(outputDir, mdFile), "utf-8");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
