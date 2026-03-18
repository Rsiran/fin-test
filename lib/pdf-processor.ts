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
    } catch (execError: any) {
      // Always check if markdown was generated despite the error.
      // opendataloader-pdf often writes the markdown before crashing
      // on image extraction (RasterFormatException, etc.)
      const mdContent = await tryReadMarkdown(outputDir);
      if (mdContent) {
        console.warn("opendataloader-pdf crashed but markdown was recovered from output");
        return mdContent;
      }

      // No output — build a useful error message from stderr
      const stderr = execError.stderr || "";
      const severeMatch = stderr.match(/SEVERE:.*$/m);
      const errorDetail = severeMatch ? severeMatch[0] : stderr.slice(-500);
      throw new Error(`PDF conversion failed: ${errorDetail || execError.message}`);
    }

    const mdContent = await tryReadMarkdown(outputDir);
    if (!mdContent) throw new Error("No markdown output generated");
    return mdContent;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
