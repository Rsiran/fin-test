import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { getPresignedUploadUrl } from "@/lib/r2";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const { companyId, fileName, fileSize } = (await req.json()) as {
      companyId: string;
      fileName: string;
      fileSize: number;
    };

    if (!companyId || !fileName || typeof fileSize !== "number" || fileSize <= 0) {
      return NextResponse.json(
        { error: "companyId, fileName, and fileSize are required" },
        { status: 400 }
      );
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Kun PDF-filer er støttet" },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Filen er for stor (maks 100 MB)" },
        { status: 400 }
      );
    }

    const r2Key = `uploads/${randomUUID()}.pdf`;
    const uploadUrl = await getPresignedUploadUrl(r2Key, fileSize);

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const docId = await convex.mutation(api.documents.create, {
      companyId: companyId as Id<"companies">,
      fileName,
      r2Key,
      reportType: "annet",
      period: "unknown",
    });

    return NextResponse.json({ uploadUrl, docId });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Kunne ikke generere opplastings-URL" },
      { status: 500 }
    );
  }
}
