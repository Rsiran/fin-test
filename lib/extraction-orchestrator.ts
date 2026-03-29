import {
  extractFinancialData,
  extractWithFeedback,
  prepareStructuredInput,
  type ExtractionResult,
} from "./financial-extractor";
import { scoreExtraction, type QualityScore } from "./quality-scorer";
import { detectColumnHints } from "./column-hints";
import { convertPdfToMarkdown } from "./pdf-processor";

const QUALITY_THRESHOLD = 60;
const MAX_VOTING_ATTEMPTS = 3;

interface Attempt {
  result: ExtractionResult;
  quality: QualityScore;
}

export function pickBestResult(attempts: Attempt[]): Attempt {
  return attempts.reduce((best, curr) =>
    curr.quality.score > best.quality.score ? curr : best
  );
}

/**
 * Extract financial data with quality-aware retry strategies.
 *
 * Strategies (in escalation order):
 * 1. Retry same prompt (LLM nondeterminism)
 * 2. Re-convert PDF with hybridMode: "full" (if pdfBuffer provided)
 * 3. Retry with feedback about missing metrics
 * 4. Multi-attempt voting (3x, take best)
 */
export async function extractWithRetry(
  markdown: string,
  options?: {
    pdfBuffer?: Buffer;
    historicalMetrics?: { metricName: string; value: number }[];
  }
): Promise<ExtractionResult & { quality: QualityScore }> {
  const attempts: Attempt[] = [];

  // Determine if structured path is used
  const { usedStructuredPath } = prepareStructuredInput(markdown);

  // Add column hints for fallback path
  let workingMarkdown = markdown;
  if (!usedStructuredPath) {
    const hints = detectColumnHints(markdown);
    if (hints) {
      console.log(`[orchestrator] Adding column hints: ${hints.slice(0, 80)}...`);
      workingMarkdown = `[COLUMN STRUCTURE]: ${hints}\n\n${markdown}`;
    }
  }

  // --- Attempt 1: Normal extraction ---
  const result1 = await extractFinancialData(workingMarkdown);
  const { content: inputContent } = prepareStructuredInput(workingMarkdown);
  const quality1 = scoreExtraction(result1.metrics, inputContent, usedStructuredPath);
  attempts.push({ result: result1, quality: quality1 });
  console.log(`[orchestrator] Attempt 1: score=${quality1.score}, metrics=${result1.metrics.length}`);

  if (quality1.score >= QUALITY_THRESHOLD) {
    return { ...result1, quality: quality1 };
  }

  // --- Strategy 1: Simple retry (LLM nondeterminism) ---
  console.log(`[orchestrator] Score ${quality1.score} < ${QUALITY_THRESHOLD}, retrying...`);
  const result2 = await extractFinancialData(workingMarkdown);
  const quality2 = scoreExtraction(result2.metrics, inputContent, usedStructuredPath);
  attempts.push({ result: result2, quality: quality2 });
  console.log(`[orchestrator] Attempt 2 (retry): score=${quality2.score}, metrics=${result2.metrics.length}`);

  if (quality2.score >= QUALITY_THRESHOLD) {
    return { ...result2, quality: quality2 };
  }

  // --- Strategy 2: Re-convert with hybridMode: "full" ---
  if (options?.pdfBuffer && !usedStructuredPath && process.env.DOCLING_SERVE_URL) {
    console.log(`[orchestrator] Retrying with hybridMode: "full"...`);
    try {
      const savedHybridMode = process.env.__HYBRID_MODE_OVERRIDE;
      process.env.__HYBRID_MODE_OVERRIDE = "full";
      const newMarkdown = await convertPdfToMarkdown(options.pdfBuffer);
      process.env.__HYBRID_MODE_OVERRIDE = savedHybridMode;

      const { usedStructuredPath: newStructured, content: newInput } = prepareStructuredInput(newMarkdown);
      const result3 = await extractFinancialData(newMarkdown);
      const quality3 = scoreExtraction(result3.metrics, newInput, newStructured);
      attempts.push({ result: result3, quality: quality3 });
      console.log(`[orchestrator] Attempt 3 (full hybrid): score=${quality3.score}, metrics=${result3.metrics.length}`);

      if (quality3.score >= QUALITY_THRESHOLD) {
        return { ...result3, quality: quality3 };
      }
    } catch (e) {
      console.warn(`[orchestrator] Full hybrid re-conversion failed:`, (e as Error).message);
    }
  }

  // --- Strategy 3: Retry with feedback ---
  const bestSoFar = pickBestResult(attempts);
  if (bestSoFar.quality.missing.length > 0) {
    console.log(`[orchestrator] Retrying with feedback, missing: ${bestSoFar.quality.missing.join(", ")}`);
    const result4 = await extractWithFeedback(workingMarkdown, bestSoFar.quality.missing);
    const quality4 = scoreExtraction(result4.metrics, inputContent, usedStructuredPath);
    attempts.push({ result: result4, quality: quality4 });
    console.log(`[orchestrator] Attempt 4 (feedback): score=${quality4.score}, metrics=${result4.metrics.length}`);

    if (quality4.score >= QUALITY_THRESHOLD) {
      return { ...result4, quality: quality4 };
    }
  }

  // --- Strategy 4: Multi-attempt voting (take best of 3) ---
  console.log(`[orchestrator] Running ${MAX_VOTING_ATTEMPTS} voting attempts...`);
  for (let i = 0; i < MAX_VOTING_ATTEMPTS; i++) {
    const resultV = await extractFinancialData(workingMarkdown);
    const qualityV = scoreExtraction(resultV.metrics, inputContent, usedStructuredPath);
    attempts.push({ result: resultV, quality: qualityV });
    console.log(`[orchestrator] Vote ${i + 1}: score=${qualityV.score}, metrics=${resultV.metrics.length}`);
  }

  // Return the best result across ALL attempts
  const best = pickBestResult(attempts);
  console.log(`[orchestrator] Final best: score=${best.quality.score}, metrics=${best.result.metrics.length} (from ${attempts.length} attempts)`);
  return { ...best.result, quality: best.quality };
}
