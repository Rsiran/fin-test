import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { openai } from "@/lib/openai";
import { generateEmbedding } from "@/lib/embeddings";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Format financial metrics into a readable summary for the chat context.
 * Groups metrics by period for easy comparison.
 */
function formatMetricsSummary(metrics: any[]): string {
  if (metrics.length === 0) return "";

  // Group by period
  const byPeriod: Record<string, any[]> = {};
  for (const m of metrics) {
    if (!byPeriod[m.period]) byPeriod[m.period] = [];
    byPeriod[m.period].push(m);
  }

  const periods = Object.keys(byPeriod).sort();
  let summary = "## Ekstraherte nøkkeltall fra opplastede rapporter\n\n";

  for (const period of periods) {
    summary += `### ${period}\n`;
    // Group by category within period
    const byCategory: Record<string, any[]> = {};
    for (const m of byPeriod[period]) {
      if (!byCategory[m.category]) byCategory[m.category] = [];
      byCategory[m.category].push(m);
    }
    for (const [category, items] of Object.entries(byCategory)) {
      summary += `**${category}:**\n`;
      for (const item of items) {
        const formatted = item.unit === "%"
          ? `${item.value}%`
          : `${item.value.toLocaleString("nb-NO")} ${item.unit}`;
        summary += `- ${item.metricName}: ${formatted}\n`;
      }
    }
    summary += "\n";
  }

  return summary;
}

/**
 * Build a standalone search query from conversation context.
 * Resolves pronouns like "denne", "det", "de" by including
 * key terms from recent messages.
 */
async function buildSearchQuery(
  message: string,
  conversationHistory: { role: string; content: string }[]
): Promise<string> {
  // If no history, use the message as-is
  if (conversationHistory.length === 0) return message;

  // Take the last 2 exchanges for context
  const recentMessages = conversationHistory.slice(-4);
  const context = recentMessages.map((m) => m.content).join(" ");

  // Use GPT-4o-mini (fast, cheap) to rewrite as a standalone query
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Omskriv brukerens spørsmål til et selvstendig søkespørsmål som kan brukes for å søke i finansrapporter. Inkluder spesifikke tall, årstall, selskap og temaer fra samtalehistorikken slik at spørsmålet gir mening uten kontekst. Returner KUN det omskrevne spørsmålet, ingen forklaring.`,
      },
      {
        role: "user",
        content: `Samtalehistorikk:\n${context}\n\nNytt spørsmål: ${message}`,
      },
    ],
    temperature: 0,
    max_tokens: 200,
  });

  return response.choices[0].message.content?.trim() || message;
}

export async function POST(req: NextRequest) {
  const { message, companyId, sessionId } = await req.json();

  // 1. Fetch conversation history, metrics, and rewrite query in parallel
  const [existingMessages, allMetrics] = await Promise.all([
    convex.query(api.chatMessages.listBySession, { sessionId }),
    convex.query(api.financialMetrics.getByCompany, { companyId }),
  ]);

  const conversationHistory = existingMessages.map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 2. Rewrite the question as a standalone search query using conversation context
  const searchQuery = await buildSearchQuery(message, conversationHistory);
  const questionEmbedding = await generateEmbedding(searchQuery);

  // 3. Vector search for relevant document chunks
  const relevantChunks = await convex.action(api.chunks.search, {
    companyId,
    embedding: questionEmbedding,
    limit: 16,
  });

  // 3. Build context: structured metrics + numbered RAG chunks
  const metricsSummary = formatMetricsSummary(allMetrics);

  const MAX_CONTEXT_CHARS = 60000;
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

  // 4. Save user message
  await convex.mutation(api.chatMessages.create, {
    sessionId,
    role: "user",
    content: message,
  });

  // 6. Stream GPT-4o response with both structured data and RAG sources
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    messages: [
      {
        role: "system",
        content: `Du er en ekspert norsk finansanalytiker. Du har tilgang til to typer data:

1. NØKKELTALL: Strukturerte finansielle nøkkeltall ekstrahert fra rapportene (tall du kan bruke direkte til sammenligninger)
2. KILDER: Nummererte utdrag fra rapportteksten (for kvalitativ kontekst og detaljer)

Regler:
- Svar ALLTID på norsk
- Bruk KONKRETE tall — du har nøkkeltallene, bruk dem aktivt for sammenligninger og analyse
- Sett inn kildehenvisninger [1], [2] osv. INLINE når du refererer til spesifikke utdrag fra rapportene
- For nøkkeltall trenger du ikke kildehenvisning — de kommer direkte fra rapportenes finansregnskap
- Formater tall med norsk format (komma som desimalskilletegn)
- Beregn endringer, vekstrater og marginer når det er relevant
- Aldri si "informasjonen er ikke tilgjengelig" hvis tallene finnes — sjekk BÅDE nøkkeltall og kilder

${metricsSummary}
Kilder fra rapporter:
${numberedContext}`,
      },
      ...conversationHistory,
      { role: "user", content: message },
    ],
  });

  // 7. Stream response, then save with source metadata
  const encoder = new TextEncoder();
  let fullResponse = "";

  const sourceMeta = selectedChunks.map((c: any, i: number) => ({
    index: i + 1,
    chunkId: c._id,
    content: c.content.substring(0, 500),
    pageRange: c.pageRange,
  }));

  const readableStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ sources: sourceMeta })}\n\n`)
      );

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      }

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
