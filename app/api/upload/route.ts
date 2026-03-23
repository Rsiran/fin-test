import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convertPdfToMarkdown } from "@/lib/pdf-processor";
import { chunkMarkdown } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { extractFinancialData } from "@/lib/financial-extractor";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

/**
 * Process documents that have already been uploaded to Convex storage.
 * Expects JSON body: { documents: [{ docId }] }
 * companyId is derived from the document record — never trusted from the client.
 */
export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const { documents } = await req.json() as {
      documents: { docId: string }[];
    };

    if (!documents || documents.length === 0) {
      return NextResponse.json(
        { error: "documents array is required" },
        { status: 400 }
      );
    }

    const results = [];

    for (const { docId } of documents) {
      try {
        // 1. Fetch document (owner-only, includes storage URL)
        const doc = await convex.query(api.documents.getWithFileUrl, {
          id: docId as Id<"documents">,
        });
        if (!doc || !doc.fileUrl) {
          throw new Error("Dokument ikke funnet eller ingen tilgang");
        }

        const companyId = doc.companyId;

        // 2. Download the PDF from Convex storage
        const pdfResponse = await fetch(doc.fileUrl);
        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

        // 3. Convert PDF to Markdown
        const markdown = await convertPdfToMarkdown(pdfBuffer);

        // 4. Store markdown in Convex file storage
        const mdUploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const mdUploadResponse = await fetch(mdUploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: markdown,
        });
        const { storageId: mdStorageId } = await mdUploadResponse.json();

        // 5. Run extraction and chunking in parallel
        const [extractionResult, chunks] = await Promise.all([
          extractFinancialData(markdown),
          Promise.resolve(chunkMarkdown(markdown)),
        ]);

        // 6. Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

        // 7. Store chunks with embeddings
        for (let i = 0; i < chunks.length; i++) {
          await convex.mutation(api.chunks.insert, {
            documentId: docId as Id<"documents">,
            companyId,
            content: chunks[i].content,
            embedding: embeddings[i],
            chunkIndex: chunks[i].chunkIndex,
          });
        }

        // 8. Store financial metrics
        if (extractionResult.metrics.length > 0) {
          await convex.mutation(api.financialMetrics.insertBatch, {
            metrics: extractionResult.metrics.map((m) => ({
              documentId: docId as Id<"documents">,
              companyId,
              period: extractionResult.period,
              category: m.category,
              metricName: m.metricName,
              value: m.value,
              unit: m.unit,
            })),
          });
        }

        // 9. Update document status to ready
        await convex.mutation(api.documents.updateStatus, {
          id: docId as Id<"documents">,
          status: "ready",
          markdownFileId: mdStorageId,
          period: extractionResult.period,
          reportType: extractionResult.reportType ?? "annet",
        });

        results.push({ docId, status: "ready" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        try {
          await convex.mutation(api.documents.updateStatus, {
            id: docId as Id<"documents">,
            status: "error",
            errorMessage,
          });
        } catch {}
        results.push({ docId, status: "error", error: errorMessage });
      }
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
