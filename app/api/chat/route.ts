import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { openai } from "@/lib/openai";
import { generateEmbedding } from "@/lib/embeddings";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const { message, companyId, sessionId } = await req.json();

  // 1. Generate embedding for the question
  const questionEmbedding = await generateEmbedding(message);

  // 2. Vector search for relevant chunks
  const relevantChunks = await convex.action(api.chunks.search, {
    companyId,
    embedding: questionEmbedding,
    limit: 16,
  });

  // 3. Build numbered context — each source gets [1], [2], etc.
  const MAX_CONTEXT_CHARS = 80000;
  let contextChars = 0;
  const selectedChunks: any[] = [];
  for (const chunk of relevantChunks) {
    if (contextChars + chunk.content.length > MAX_CONTEXT_CHARS) break;
    selectedChunks.push(chunk);
    contextChars += chunk.content.length;
  }

  const numberedContext = selectedChunks
    .map((chunk: any, i: number) => `[Kilde ${i + 1}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  // 4. Fetch conversation history
  const existingMessages = await convex.query(api.chatMessages.listBySession, { sessionId });
  const conversationHistory = existingMessages.map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 5. Save user message
  await convex.mutation(api.chatMessages.create, {
    sessionId,
    role: "user",
    content: message,
  });

  // 6. Stream GPT-4o response with inline citation instructions
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      {
        role: "system",
        content: `Du er en ekspert norsk finansanalytiker. Du har tilgang til nummererte utdrag fra selskapets finansrapporter.

Regler:
- Svar ALLTID på norsk
- Bruk KONKRETE tall og data fra kildene
- Sett inn kildehenvisninger som [1], [2] osv. INLINE i teksten etter påstander som er basert på en kilde
- Eksempel: "Driftsinntektene var 500 MNOK [1], en økning på 12% fra året før [3]."
- Bruk SÅ MANGE kildehenvisninger som nødvendig — hver påstand med tall bør ha en referanse
- Formater tall med norsk format
- Aldri si "informasjonen er ikke tilgjengelig" hvis tallene finnes i kildene — sjekk nøye

Kilder:
${numberedContext}`,
      },
      ...conversationHistory,
      { role: "user", content: message },
    ],
  });

  // 7. Stream response, then save with source metadata
  const encoder = new TextEncoder();
  let fullResponse = "";

  // Send source metadata first so the client can map [N] references
  const sourceMeta = selectedChunks.map((c: any, i: number) => ({
    index: i + 1,
    chunkId: c._id,
    content: c.content.substring(0, 500),
    pageRange: c.pageRange,
  }));

  const readableStream = new ReadableStream({
    async start(controller) {
      // Send sources as first event so client has them before text arrives
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ sources: sourceMeta })}\n\n`)
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      }

      // Save assistant message with sources
      await convex.mutation(api.chatMessages.create, {
        sessionId,
        role: "assistant",
        content: fullResponse,
        sources: selectedChunks.slice(0, 10).map((c: any) => ({
          chunkId: c._id,
          content: c.content.substring(0, 500),
          pageRange: c.pageRange,
        })),
      });

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
