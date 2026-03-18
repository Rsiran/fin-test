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
    limit: 8,
  });

  // 3. Build context from chunks
  const context = relevantChunks
    .map((chunk: any) => chunk.content)
    .join("\n\n---\n\n");

  // 4. Fetch conversation history for multi-turn context
  const existingMessages = await convex.query(api.chatMessages.listBySession, { sessionId });
  const conversationHistory = existingMessages.map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 5. Save user message to Convex
  await convex.mutation(api.chatMessages.create, {
    sessionId,
    role: "user",
    content: message,
  });

  // 6. Stream GPT-4o response (includes full conversation history)
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      {
        role: "system",
        content: `Du er en norsk finansanalytiker. Svar på spørsmål basert på følgende kontekst fra selskapets rapporter. Svar alltid på norsk. Vær presis og referer til spesifikke tall fra rapportene.

Kontekst:
${context}`,
      },
      ...conversationHistory,
      { role: "user", content: message },
    ],
  });

  // 7. Stream response back
  const encoder = new TextEncoder();
  let fullResponse = "";

  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      }

      // Save assistant message to Convex
      await convex.mutation(api.chatMessages.create, {
        sessionId,
        role: "assistant",
        content: fullResponse,
        sources: relevantChunks.slice(0, 3).map((c: any) => ({
          chunkId: c._id,
          content: c.content.substring(0, 200),
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
