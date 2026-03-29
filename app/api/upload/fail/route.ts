import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

export async function POST(req: NextRequest) {
  try {
    const token = await convexAuthNextjsToken();
    if (!token) {
      return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
    }

    const { docId, error } = (await req.json()) as {
      docId: string;
      error?: string;
    };

    if (!docId) {
      return NextResponse.json({ error: "docId is required" }, { status: 400 });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    await convex.mutation(api.documents.updateStatus, {
      id: docId as Id<"documents">,
      status: "error",
      errorMessage: error || "Opplasting feilet",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Upload fail handler error:", err);
    return NextResponse.json({ error: "Kunne ikke oppdatere status" }, { status: 500 });
  }
}
