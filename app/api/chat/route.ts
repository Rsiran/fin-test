import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getOpenAI } from "@/lib/openai";
import { generateEmbedding } from "@/lib/embeddings";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

interface FinancialMetric {
  period: string;
  category: string;
  metricName: string;
  value: number;
  unit: string;
}

interface ChunkResult {
  _id: string;
  content: string;
  pageRange?: string;
}

const CHART_TOOL = {
  type: "function" as const,
  function: {
    name: "create_chart",
    description:
      "Create an inline chart visualization for financial data. Use when the user asks for trends, comparisons, graphs, or visual representations of financial metrics.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bar", "line"],
          description: "Chart type. Use 'bar' for comparisons, 'line' for trends over time.",
        },
        title: {
          type: "string",
          description: "Chart title, e.g. 'Driftsinntekter (mrd NOK)'",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "X-axis labels, e.g. ['2020', '2021', '2022']",
        },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              values: { type: "array", items: { type: "number" } },
            },
            required: ["label", "values"],
          },
          description: "One or more data series",
        },
        unit: {
          type: "string",
          description: "Unit label for values, e.g. 'mrd NOK', '%'",
        },
      },
      required: ["type", "title", "labels", "datasets"],
    },
  },
};

function formatMetricsSummary(metrics: FinancialMetric[]): string {
  if (metrics.length === 0) return "";

  const byPeriod: Record<string, FinancialMetric[]> = {};
  for (const m of metrics) {
    if (!byPeriod[m.period]) byPeriod[m.period] = [];
    byPeriod[m.period].push(m);
  }

  const periods = Object.keys(byPeriod).sort((a, b) => {
    // Extract year and suffix (e.g., "2025-Q1" → ["2025", "Q1"], "2025-FY" → ["2025", "FY"])
    const [yearA, suffA = ""] = a.split("-");
    const [yearB, suffB = ""] = b.split("-");
    if (yearA !== yearB) return yearA.localeCompare(yearB);
    // Within same year: Q1 < Q2 < Q3 < Q4 < FY
    const order = (s: string) =>
      s === "Q1" ? 1 : s === "Q2" ? 2 : s === "Q3" ? 3 : s === "Q4" ? 4 : s === "FY" ? 5 : 6;
    return order(suffA) - order(suffB);
  });
  let summary = "## Ekstraherte nøkkeltall fra opplastede rapporter\n\n";

  for (const period of periods) {
    summary += `### ${period}\n`;
    const byCategory: Record<string, FinancialMetric[]> = {};
    for (const m of byPeriod[period]) {
      if (!byCategory[m.category]) byCategory[m.category] = [];
      byCategory[m.category].push(m);
    }
    for (const [category, items] of Object.entries(byCategory)) {
      summary += `**${category}:**\n`;
      for (const item of items) {
        const formatted =
          item.unit === "%"
            ? `${item.value}%`
            : `${item.value.toLocaleString("nb-NO")} ${item.unit}`;
        summary += `- ${item.metricName}: ${formatted}\n`;
      }
    }
    summary += "\n";
  }

  return summary;
}

async function buildSearchQuery(
  message: string,
  conversationHistory: { role: string; content: string }[]
): Promise<string> {
  if (conversationHistory.length === 0) return message;

  const recentMessages = conversationHistory.slice(-4);
  const context = recentMessages.map((m) => m.content).join(" ");

  const response = await getOpenAI().chat.completions.create({
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
  const token = await convexAuthNextjsToken();
  if (!token) {
    return new Response(JSON.stringify({ error: "Ikke autentisert" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(token);

  const { message, companyId, sessionId } = await req.json();

  const [existingMessages, allMetrics] = await Promise.all([
    convex.query(api.chatMessages.listBySession, { sessionId }),
    convex.query(api.financialMetrics.getByCompany, { companyId }),
  ]);

  const conversationHistory = existingMessages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  );

  const searchQuery = await buildSearchQuery(message, conversationHistory);
  const questionEmbedding = await generateEmbedding(searchQuery);

  const relevantChunks = await convex.action(api.chunks.search, {
    companyId,
    embedding: questionEmbedding,
    limit: 16,
  });

  const metricsSummary = formatMetricsSummary(allMetrics);

  const MAX_CONTEXT_CHARS = 60000;
  let contextChars = 0;
  const selectedChunks: ChunkResult[] = [];
  for (const chunk of relevantChunks) {
    if (contextChars + chunk.content.length > MAX_CONTEXT_CHARS) break;
    selectedChunks.push(chunk);
    contextChars += chunk.content.length;
  }

  const numberedContext = selectedChunks
    .map((chunk, i) => `[Kilde ${i + 1}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  await convex.mutation(api.chatMessages.create, {
    sessionId,
    role: "user",
    content: message,
  });

  // Auto-generate session title from first message
  if (conversationHistory.length === 0) {
    getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Lag en kort tittel (maks 4-5 ord, på norsk) som oppsummerer brukerens spørsmål. Returner KUN tittelen, ingen anførselstegn eller forklaring.",
        },
        { role: "user", content: message },
      ],
      temperature: 0,
      max_tokens: 30,
    }).then((res) => {
      const title = res.choices[0].message.content?.trim();
      if (title) {
        convex.mutation(api.chatSessions.updateTitle, { sessionId, title });
      }
    }).catch(() => {});
  }

  const systemPrompt = `Du er en ekspert norsk finansanalytiker. Du har tilgang til to typer data:

1. NØKKELTALL: Strukturerte finansielle nøkkeltall ekstrahert fra rapportene (tall du kan bruke direkte til sammenligninger)
2. KILDER: Nummererte utdrag fra rapportteksten (for kvalitativ kontekst og detaljer)

Regler:
- Svar ALLTID på norsk
- Bruk KONKRETE tall — du har nøkkeltallene, bruk dem aktivt for sammenligninger og analyse
- Strukturer svaret tydelig med nummererte lister og **fet skrift** for overskrifter når du forklarer flere faktorer eller punkter
- Sett inn kildehenvisninger [1], [2] osv. INLINE når du bruker informasjon fra en kilde. Bruk ulike kildenummer for ulike fakta — ikke gjenta samme kilde for alt
- Formater tall med norsk format (komma som desimalskilletegn)
- Beregn endringer, vekstrater og marginer når det er relevant
- Aldri si "informasjonen er ikke tilgjengelig" hvis tallene finnes — sjekk BÅDE nøkkeltall og kilder
- Når brukeren ber om en graf, trend, eller visuell fremstilling, bruk create_chart-verktøyet med korrekte data fra nøkkeltallene/kildene. Gi ALLTID en tekstforklaring i tillegg til grafen.

${metricsSummary}
Kilder fra rapporter:
${numberedContext}`;

  const sourceMeta = selectedChunks.map((c, i) => ({
    index: i + 1,
    chunkId: c._id,
    content: c.content.substring(0, 1500),
    pageRange: c.pageRange,
  }));

  const encoder = new TextEncoder();
  let fullResponse = "";
  let chartData: {
    type: "bar" | "line";
    title: string;
    labels: string[];
    datasets: { label: string; values: number[] }[];
    unit?: string;
  } | null = null;

  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationHistory.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  const readableStream = new ReadableStream({
    async start(controller) {
      // First call — may produce a tool call or direct content
      const stream = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        stream: true,
        messages: chatMessages,
        tools: [CHART_TOOL],
      });

      let toolCallId = "";
      let toolCallArgs = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Accumulate tool call
        if (delta?.tool_calls?.[0]) {
          const tc = delta.tool_calls[0];
          if (tc.id) toolCallId = tc.id;
          if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
        }

        // Stream content
        const content = delta?.content || "";
        if (content) {
          fullResponse += content;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
          );
        }
      }

      // If tool was called, parse chart and get commentary
      if (toolCallId && toolCallArgs) {
        try {
          chartData = JSON.parse(toolCallArgs);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ chart: chartData })}\n\n`)
          );

          // Second call: provide tool result so GPT can give commentary
          const followUp = await getOpenAI().chat.completions.create({
            model: "gpt-4o",
            stream: true,
            messages: [
              ...chatMessages,
              {
                role: "assistant" as const,
                content: null,
                tool_calls: [
                  {
                    id: toolCallId,
                    type: "function" as const,
                    function: {
                      name: "create_chart",
                      arguments: toolCallArgs,
                    },
                  },
                ],
              },
              {
                role: "tool" as const,
                tool_call_id: toolCallId,
                content: `Grafen "${chartData!.title}" er opprettet og vist til brukeren. Gi nå en kort tekstlig analyse og forklaring av dataene i grafen. Bruk kildehenvisninger.`,
              },
            ],
            tools: [CHART_TOOL],
          });

          for await (const chunk of followUp) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }
          }
        } catch {
          // If chart parsing fails, continue without chart
        }
      }

      // Extract which source indices GPT actually cited: [1], [2], [Kilde 3], etc.
      const citedIndices = new Set<number>();
      const citePattern = /\[(?:Kilde\s*)?(\d+)\]/g;
      let match;
      while ((match = citePattern.exec(fullResponse)) !== null) {
        citedIndices.add(parseInt(match[1], 10));
      }

      // Filter to only cited sources
      const citedSources = sourceMeta.filter((s) => citedIndices.has(s.index));

      // Send cited sources after streaming completes
      if (citedSources.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ sources: citedSources })}\n\n`)
        );
      }

      // Generate dynamic follow-up suggestions based on conversation
      try {
        const suggestionsResponse = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Basert på samtalen nedenfor, foreslå 3 korte oppfølgingsspørsmål brukeren kan stille om selskapet. Hvert spørsmål skal være maks 6 ord, på norsk, og relevant til konteksten. Returner KUN 3 spørsmål separert med newline, ingen nummerering eller punkttegn.`,
            },
            { role: "user", content: message },
            { role: "assistant", content: fullResponse.substring(0, 500) },
          ],
          temperature: 0.7,
          max_tokens: 100,
        });
        const suggestionsText = suggestionsResponse.choices[0].message.content?.trim() || "";
        const suggestions = suggestionsText.split("\n").filter((s) => s.trim()).slice(0, 3);
        if (suggestions.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ suggestions })}\n\n`)
          );
        }
      } catch {
        // Suggestions are non-critical, skip on failure
      }

      // Save assistant message with only cited sources
      await convex.mutation(api.chatMessages.create, {
        sessionId,
        role: "assistant",
        content: fullResponse,
        sources: citedSources.map((s) => ({
          chunkId: s.chunkId as Id<"chunks">,
          content: s.content,
          pageRange: s.pageRange,
        })),
        ...(chartData ? { chart: chartData } : {}),
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
