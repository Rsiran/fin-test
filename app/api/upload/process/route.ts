import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convertPdfToMarkdown } from "@/lib/pdf-processor";
import { chunkMarkdown } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { extractWithRetry } from "@/lib/extraction-orchestrator";
import { periodToFileName } from "@/lib/period-format";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { downloadToFile } from "@/lib/r2";
import { deduplicateMarkdown } from "@/lib/markdown-dedup";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Must stay well below auth token TTL (~1h). See spec Section 4.
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Serialize background processing — only one PDF at a time to avoid
// concurrent Java processes exhausting container RAM (each needs ~4GB).
const processingQueue: (() => void)[] = [];
let isProcessing = false;

function enqueueProcessing(fn: () => Promise<void>): void {
  const run = async () => {
    isProcessing = true;
    try {
      await fn();
    } finally {
      isProcessing = false;
      const next = processingQueue.shift();
      if (next) next();
    }
  };

  if (!isProcessing) {
    run();
  } else {
    processingQueue.push(() => { run(); });
  }
}

async function processInBackground(
  convex: ConvexHttpClient,
  docId: Id<"documents">,
  companyId: Id<"companies">,
  r2Key: string
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "r2-download-"));

  try {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutP = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Prosessering tidsavbrutt (>10 min)")),
        PROCESSING_TIMEOUT_MS
      );
    });
    try {
      await Promise.race([
        doProcessing(convex, docId, companyId, r2Key, tempDir),
        timeoutP,
      ]);
    } finally {
      clearTimeout(timer!);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Processing failed for ${docId}:`, errorMessage);
    try {
      await convex.mutation(api.documents.updateStatus, {
        id: docId,
        status: "error",
        errorMessage,
      });
    } catch {
      // Last resort — stale cleanup will catch this
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function doProcessing(
  convex: ConvexHttpClient,
  docId: Id<"documents">,
  companyId: Id<"companies">,
  r2Key: string,
  tempDir: string
): Promise<void> {
  const pdfPath = join(tempDir, "input.pdf");

  await downloadToFile(r2Key, pdfPath);
  const pdfBuffer = await readFile(pdfPath);

  // 4. Convert PDF to Markdown
  console.log(`Processing ${docId}: converting PDF to markdown`);
  const rawMarkdown = await convertPdfToMarkdown(pdfBuffer);

  // 4b. Deduplicate and deinterleave
  console.log(`Processing ${docId}: deduplicating markdown`);
  const markdown = deduplicateMarkdown(rawMarkdown);

  // 5. Store markdown in Convex file storage
  const mdUploadUrl = await convex.mutation(
    api.documents.generateUploadUrl
  );
  const mdUploadResponse = await fetch(mdUploadUrl, {
    method: "POST",
    headers: { "Content-Type": "text/markdown" },
    body: markdown,
  });
  const { storageId: mdStorageId } = await mdUploadResponse.json();

  // 6. Run extraction and chunking in parallel
  console.log(`Processing ${docId}: extracting metrics and chunking`);
  const [extractionResult, chunks] = await Promise.all([
    extractWithRetry(markdown, { pdfBuffer }),
    Promise.resolve(chunkMarkdown(markdown)),
  ]);

  // 7. Generate embeddings for all chunks
  console.log(`Processing ${docId}: generating embeddings for ${chunks.length} chunks`);
  const embeddings = await generateEmbeddings(
    chunks.map((c) => c.content)
  );

  // 8. Store chunks with embeddings
  for (let i = 0; i < chunks.length; i++) {
    await convex.mutation(api.chunks.insert, {
      documentId: docId,
      companyId,
      content: chunks[i].content,
      embedding: embeddings[i],
      chunkIndex: chunks[i].chunkIndex,
    });
  }

  // 9. Cross-period magnitude check (revenue + total assets + equity)
  let normalizationWarning: string | undefined;
  const magnitudeMetrics = ["driftsinntekter", "sum_eiendeler", "egenkapital"];
  const magnitudeWarnings: string[] = [];

  for (const metricName of magnitudeMetrics) {
    const newMetric = extractionResult.metrics.find((m) => m.metricName === metricName);
    if (!newMetric) continue;
    try {
      const existing = await convex.query(
        api.financialMetrics.getByCompanyAndMetric,
        { companyId, metricName }
      );
      if (existing.length > 0) {
        const latest = existing.sort((a, b) => b.period.localeCompare(a.period))[0];
        if (latest.value !== 0) {
          const ratio = newMetric.value / latest.value;
          if (ratio > 10 || ratio < 0.1) {
            const msg =
              `${metricName}: ${extractionResult.period} (${newMetric.value} ${newMetric.unit}) ` +
              `er ${ratio.toFixed(1)}x av ${latest.period} (${latest.value} ${latest.unit})`;
            magnitudeWarnings.push(msg);
            console.warn(`MAGNITUDE CHECK FAILED: ${msg}`);
          }
        }
      }
    } catch (e) {
      console.warn(`Magnitude check error for ${metricName}:`, e);
    }
  }

  if (magnitudeWarnings.length > 0) {
    normalizationWarning =
      `Mulig enhetsfeil. Detektert originalUnit: "${extractionResult.originalUnit ?? "ukjent"}". ` +
      `Bevis: "${extractionResult.unitEvidence ?? "ingen"}". ` +
      magnitudeWarnings.join("; ");
  }

  // 10. Store financial metrics
  if (extractionResult.metrics.length > 0) {
    await convex.mutation(api.financialMetrics.insertBatch, {
      metrics: extractionResult.metrics.map((m) => ({
        documentId: docId,
        companyId,
        period: extractionResult.period,
        category: m.category,
        metricName: m.metricName,
        value: m.value,
        unit: m.unit,
        sourceLabel: m.sourceLabel,
      })),
    });
  }

  // 11. Update document status to ready
  // Guard: if timeout already set status to "error", don't overwrite
  const currentDoc = await convex.query(api.documents.get, { id: docId });
  if (currentDoc && currentDoc.status !== "error") {
    const standardizedName = periodToFileName(extractionResult.period);
    await convex.mutation(api.documents.updateStatus, {
      id: docId,
      status: "ready",
      markdownFileId: mdStorageId,
      period: extractionResult.period,
      reportType: extractionResult.reportType ?? "annet",
      currency: extractionResult.currency,
      originalUnit: extractionResult.originalUnit,
      unitEvidence: extractionResult.unitEvidence,
      periodScope: extractionResult.periodScope,
      periodEvidence: extractionResult.periodEvidence,
      normalizationWarning,
      extractionQuality: extractionResult.quality?.score,
      ...(standardizedName ? { fileName: standardizedName } : {}),
    });
    console.log(`Processing ${docId}: complete`);
  } else {
    console.warn(`Processing ${docId}: skipping status update — document already in terminal state`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const { docId, reprocess } = (await req.json()) as {
      docId: string;
      reprocess?: boolean;
    };
    if (!docId) {
      return NextResponse.json(
        { error: "docId is required" },
        { status: 400 }
      );
    }

    const typedDocId = docId as Id<"documents">;

    if (reprocess) {
      // Re-process: reset document and re-run pipeline
      const { r2Key, companyId } = await convex.mutation(
        api.documents.resetForReprocessing,
        { id: typedDocId }
      );

      enqueueProcessing(() =>
        processInBackground(convex, typedDocId, companyId, r2Key)
      );

      return NextResponse.json({ docId, status: "reprocessing" });
    }

    // Original upload flow
    const doc = await convex.query(api.documents.get, { id: typedDocId });
    if (!doc) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }
    if (doc.status !== "uploading" || !doc.r2Key) {
      return NextResponse.json(
        { error: "Dokumentet er ikke klart for prosessering" },
        { status: 400 }
      );
    }

    await convex.mutation(api.documents.updateStatus, {
      id: typedDocId,
      status: "processing",
    });

    const r2Key = doc.r2Key;

    enqueueProcessing(() =>
      processInBackground(convex, typedDocId, doc.companyId, r2Key)
    );

    return NextResponse.json({ docId, status: "processing" });
  } catch {
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
