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

    // Phase 1: Upload ALL files to Convex storage and create document records immediately.
    // This makes all documents visible in the UI right away with "Prosesserer..." status.
    const fileEntries: { file: File; docId: any; storageId: any }[] = [];

    for (const file of files) {
      try {
        const uploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await uploadResponse.json();

        const docId = await convex.mutation(api.documents.create, {
          companyId: companyId as any,
          fileName: file.name,
          fileId: storageId,
          reportType: "annet",
          period: "unknown",
        });

        fileEntries.push({ file, docId, storageId });
      } catch (error) {
        // If even the upload fails, skip this file
        console.error(`Failed to upload ${file.name}:`, error);
      }
    }

    // Phase 2: Process each file (PDF conversion, chunking, extraction).
    // Documents already exist in Convex with "processing" status.
    const results = [];

    for (const { file, docId } of fileEntries) {
      try {
        // 1. Convert PDF to Markdown
        const pdfBuffer = Buffer.from(await file.arrayBuffer());
        const markdown = await convertPdfToMarkdown(pdfBuffer);

        // 2. Store markdown in Convex file storage
        const mdUploadUrl = await convex.mutation(api.documents.generateUploadUrl);
        const mdUploadResponse = await fetch(mdUploadUrl, {
          method: "POST",
          headers: { "Content-Type": "text/markdown" },
          body: markdown,
        });
        const { storageId: mdStorageId } = await mdUploadResponse.json();

        // 3. Run extraction and chunking in parallel
        const [extractionResult, chunks] = await Promise.all([
          extractFinancialData(markdown),
          Promise.resolve(chunkMarkdown(markdown)),
        ]);

        // 4. Generate embeddings for all chunks
        const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

        // 5. Store chunks with embeddings
        for (let i = 0; i < chunks.length; i++) {
          await convex.mutation(api.chunks.insert, {
            documentId: docId,
            companyId: companyId as any,
            content: chunks[i].content,
            embedding: embeddings[i],
            chunkIndex: chunks[i].chunkIndex,
          });
        }

        // 6. Store financial metrics
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

        // 7. Update document status to ready
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
        // Mark the document as errored (it already exists in Convex)
        try {
          await convex.mutation(api.documents.updateStatus, {
            id: docId,
            status: "error",
            errorMessage,
          });
        } catch {}
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
