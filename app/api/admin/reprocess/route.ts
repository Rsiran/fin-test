import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { extractFinancialData } from "@/lib/financial-extractor";

/**
 * POST /api/admin/reprocess
 *
 * Re-extracts financial metrics from stored markdown for existing documents.
 * Deletes old metrics, runs improved extraction prompt, inserts new metrics.
 *
 * Headers:
 *   x-admin-secret: ADMIN_API_SECRET
 *
 * Body (one of):
 *   { "docIds": ["id1", "id2"] }   — reprocess specific documents
 *   { "companyId": "..." }          — reprocess all ready documents for a company
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  const body = await req.json();
  let docIds: Id<"documents">[];

  if (body.companyId) {
    docIds = await convex.query(api.admin.getReadyDocumentsByCompany, {
      companyId: body.companyId as Id<"companies">,
    });
  } else if (body.docIds && Array.isArray(body.docIds)) {
    docIds = body.docIds as Id<"documents">[];
  } else {
    return NextResponse.json(
      { error: "Provide docIds[] or companyId" },
      { status: 400 },
    );
  }

  const results: {
    docId: string;
    fileName: string;
    status: "ok" | "error" | "skipped";
    metricsDeleted?: number;
    metricsInserted?: number;
    error?: string;
  }[] = [];

  for (const docId of docIds) {
    try {
      const doc = await convex.query(api.admin.getDocumentWithMarkdown, {
        docId,
      });
      if (!doc || !doc.markdownUrl) {
        results.push({
          docId,
          fileName: "unknown",
          status: "skipped",
          error: "No markdown available",
        });
        continue;
      }

      const mdResponse = await fetch(doc.markdownUrl);
      if (!mdResponse.ok) {
        results.push({
          docId,
          fileName: doc.fileName,
          status: "error",
          error: `Failed to fetch markdown: ${mdResponse.status}`,
        });
        continue;
      }
      const markdown = await mdResponse.text();

      console.log(`Reprocessing ${doc.fileName} (${docId})`);
      const extraction = await extractFinancialData(markdown);

      const deleted = await convex.mutation(
        api.admin.deleteMetricsByDocument,
        { documentId: docId },
      );

      let inserted = 0;
      if (extraction.metrics.length > 0) {
        inserted = await convex.mutation(api.admin.insertMetricsAdmin, {
          metrics: extraction.metrics.map((m) => ({
            documentId: docId,
            companyId: doc.companyId,
            period: extraction.period,
            category: m.category,
            metricName: m.metricName,
            value: m.value,
            unit: m.unit,
          })),
        });
      }

      await convex.mutation(api.admin.updateDocumentExtraction, {
        docId,
        period: extraction.period,
        reportType: extraction.reportType ?? "annet",
        currency: extraction.currency,
        originalUnit: extraction.originalUnit,
        unitEvidence: extraction.unitEvidence,
      });

      results.push({
        docId,
        fileName: doc.fileName,
        status: "ok",
        metricsDeleted: deleted,
        metricsInserted: inserted,
      });
      console.log(
        `Reprocessed ${doc.fileName}: ${deleted} deleted, ${inserted} inserted`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`Reprocess failed for ${docId}:`, msg);
      results.push({ docId, fileName: "unknown", status: "error", error: msg });
    }
  }

  return NextResponse.json({ results });
}
