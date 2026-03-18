import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { convertPdfToMarkdown } from "@/lib/pdf-processor";
import { chunkMarkdown } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { extractFinancialData } from "@/lib/financial-extractor";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyId = formData.get("companyId") as string;
    const files = formData.getAll("files") as File[];

    if (!companyId || files.length === 0) {
      return NextResponse.json(
        { error: "companyId and files are required" },
        { status: 400 }
      );
    }

    const results = [];

    for (const file of files) {
      try {
        // 1. Upload PDF to Convex storage
        const uploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await uploadResponse.json();

        // 2. Create document record (status: processing)
        const docId = await convex.mutation(api.documents.create, {
          companyId: companyId as any,
          fileName: file.name,
          fileId: storageId,
          reportType: "annet",
          period: "unknown",
        });

        // 3. Convert PDF to Markdown
        const pdfBuffer = Buffer.from(await file.arrayBuffer());
        const markdown = await convertPdfToMarkdown(pdfBuffer);

        // 4. Store markdown in Convex file storage
        const mdUploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const mdUploadResponse = await fetch(mdUploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: markdown,
        });
        const { storageId: mdStorageId } = await mdUploadResponse.json();

        // 5. Run both paths in parallel
        const [extractionResult, chunks] = await Promise.all([
          extractFinancialData(markdown),
          Promise.resolve(chunkMarkdown(markdown)),
        ]);

        // 6. Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

        // 7. Store chunks with embeddings in Convex
        for (let i = 0; i < chunks.length; i++) {
          await convex.mutation(api.chunks.insert, {
            documentId: docId,
            companyId: companyId as any,
            content: chunks[i].content,
            embedding: embeddings[i],
            chunkIndex: chunks[i].chunkIndex,
          });
        }

        // 8. Store financial metrics
        if (extractionResult.metrics.length > 0) {
          await convex.mutation(api.financialMetrics.insertBatch, {
            metrics: extractionResult.metrics.map((m) => ({
              documentId: docId,
              companyId: companyId as any,
              period: extractionResult.period,
              category: m.category,
              metricName: m.metricName,
              value: m.value,
              unit: m.unit,
            })),
          });
        }

        // 9. Update document status to ready + write back extracted period/type
        await convex.mutation(api.documents.updateStatus, {
          id: docId,
          status: "ready",
          markdownFileId: mdStorageId,
          period: extractionResult.period,
          reportType: extractionResult.reportType ?? "annet",
        });

        results.push({ fileName: file.name, status: "ready", docId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push({ fileName: file.name, status: "error", error: errorMessage });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
