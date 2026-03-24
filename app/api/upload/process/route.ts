import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convertPdfToMarkdown } from "@/lib/pdf-processor";
import { chunkMarkdown } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { extractFinancialData } from "@/lib/financial-extractor";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { downloadToFile, deleteObject } from "@/lib/r2";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const { docId } = (await req.json()) as { docId: string };
    if (!docId) {
      return NextResponse.json(
        { error: "docId is required" },
        { status: 400 }
      );
    }

    const typedDocId = docId as Id<"documents">;

    // 1. Fetch document and verify ownership + status
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

    const companyId = doc.companyId;
    const r2Key = doc.r2Key;

    // 2. Set status to "processing"
    await convex.mutation(api.documents.updateStatus, {
      id: typedDocId,
      status: "processing",
    });

    try {
      // 3. Download PDF from R2 to temp file
      const tempDir = await mkdtemp(join(tmpdir(), "r2-download-"));
      const pdfPath = join(tempDir, "input.pdf");

      try {
        await downloadToFile(r2Key, pdfPath);
        const pdfBuffer = await readFile(pdfPath);

        // 4. Convert PDF to Markdown
        const markdown = await convertPdfToMarkdown(pdfBuffer);

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
        const [extractionResult, chunks] = await Promise.all([
          extractFinancialData(markdown),
          Promise.resolve(chunkMarkdown(markdown)),
        ]);

        // 7. Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(
          chunks.map((c) => c.content)
        );

        // 8. Store chunks with embeddings
        for (let i = 0; i < chunks.length; i++) {
          await convex.mutation(api.chunks.insert, {
            documentId: typedDocId,
            companyId,
            content: chunks[i].content,
            embedding: embeddings[i],
            chunkIndex: chunks[i].chunkIndex,
          });
        }

        // 9. Cross-period magnitude check
        let normalizationWarning: string | undefined;
        const newRevenue = extractionResult.metrics.find(
          (m) => m.metricName === "driftsinntekter"
        );
        if (newRevenue) {
          try {
            const existingRevenue = await convex.query(
              api.financialMetrics.getByCompanyAndMetric,
              { companyId, metricName: "driftsinntekter" }
            );
            if (existingRevenue.length > 0) {
              const latest = existingRevenue.sort((a, b) =>
                b.period.localeCompare(a.period)
              )[0];
              if (latest.value !== 0) {
                const ratio = newRevenue.value / latest.value;
                if (ratio > 10 || ratio < 0.1) {
                  normalizationWarning =
                    `Mulig enhetsfeil: ${extractionResult.period} driftsinntekter ` +
                    `(${newRevenue.value} ${newRevenue.unit}) er ${ratio.toFixed(1)}x ` +
                    `av ${latest.period} (${latest.value} ${latest.unit}). ` +
                    `Detektert originalUnit: "${extractionResult.originalUnit ?? "ukjent"}". ` +
                    `Bevis: "${extractionResult.unitEvidence ?? "ingen"}"`;
                  console.warn("MAGNITUDE CHECK FAILED:", normalizationWarning);
                }
              }
            }
          } catch (e) {
            console.warn("Magnitude check error:", e);
          }
        }

        // 10. Store financial metrics
        if (extractionResult.metrics.length > 0) {
          await convex.mutation(api.financialMetrics.insertBatch, {
            metrics: extractionResult.metrics.map((m) => ({
              documentId: typedDocId,
              companyId,
              period: extractionResult.period,
              category: m.category,
              metricName: m.metricName,
              value: m.value,
              unit: m.unit,
            })),
          });
        }

        // 11. Delete PDF from R2 (best-effort)
        await deleteObject(r2Key);

        // 12. Update document status to ready, clear r2Key
        await convex.mutation(api.documents.updateStatus, {
          id: typedDocId,
          status: "ready",
          markdownFileId: mdStorageId,
          period: extractionResult.period,
          reportType: extractionResult.reportType ?? "annet",
          currency: extractionResult.currency,
          originalUnit: extractionResult.originalUnit,
          unitEvidence: extractionResult.unitEvidence,
          normalizationWarning,
          clearR2Key: true,
        });

        return NextResponse.json({ docId, status: "ready" });
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      try {
        await convex.mutation(api.documents.updateStatus, {
          id: typedDocId,
          status: "error",
          errorMessage,
        });
      } catch {}
      return NextResponse.json({ docId, status: "error", error: errorMessage });
    }
  } catch {
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
