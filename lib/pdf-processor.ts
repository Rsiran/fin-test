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

    await execFileAsync("npx", [
      "@opendataloader/pdf",
      inputPath,
      "--output", outputDir,
      "--format", "markdown",
    ], {
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const files = await readdir(outputDir);
    const mdFile = files.find((f) => f.endsWith(".md"));
    if (!mdFile) throw new Error("No markdown output generated");

    return await readFile(join(outputDir, mdFile), "utf-8");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
