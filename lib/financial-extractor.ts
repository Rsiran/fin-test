import { canonicalizePeriod } from "./period-format";

export interface ExtractedMetric {
  metricName: string;
  value: number;
  unit: string;
  category: string;
  confidence: "high" | "medium" | "low";
  flagged?: boolean;
}

export interface ExtractionResult {
  period: string;
  reportType: string;
  metrics: ExtractedMetric[];
}

export interface ValidationResult {
  valid: ExtractedMetric[];
  rejected: { metric: ExtractedMetric; reason: string }[];
}

const NON_NEGATIVE_METRICS = [
  "driftsinntekter", "sum_eiendeler", "egenkapital",
];

export function validateMetrics(metrics: ExtractedMetric[]): ValidationResult {
  const valid: ExtractedMetric[] = [];
  const rejected: { metric: ExtractedMetric; reason: string }[] = [];

  for (const metric of metrics) {
    if (metric.unit === "%" && Math.abs(metric.value) > 100) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value}% exceeds ±100%` });
      continue;
    }

    if (NON_NEGATIVE_METRICS.includes(metric.metricName) && metric.value < 0) {
      rejected.push({ metric, reason: `${metric.metricName}: unexpected negative value ${metric.value}` });
      continue;
    }

    if (metric.confidence === "low") {
      valid.push({ ...metric, flagged: true });
    } else {
      valid.push(metric);
    }
  }

  return { valid, rejected };
}

// Keywords that indicate financial statement sections (Norwegian + English)
const FINANCIAL_KEYWORDS = [
  // Norwegian
  "resultatregnskap", "balanse", "kontantstrøm", "kontantstrømoppstilling",
  "driftsinntekter", "driftsresultat", "ebitda", "årsresultat",
  "sum eiendeler", "egenkapital", "gjeld", "totalkapital",
  "resultat per aksje", "driftsmargin", "netto margin",
  "operasjonelle aktiviteter", "investeringsaktiviteter", "finansieringsaktiviteter",
  "nøkkeltall", "hovedtall", "konsernregnskap", "finansielle hovedtall",
  // English
  "income statement", "balance sheet", "cash flow", "statement of profit",
  "statement of financial position", "statement of cash flows",
  "revenue", "operating profit", "total assets", "total equity",
  "earnings per share", "consolidated statement", "financial highlights",
  "key figures", "profit and loss", "comprehensive income",
];

/**
 * Extract only the financially relevant sections from a large document.
 * Splits on headings, scores each section by keyword density, returns
 * the top sections up to a token budget.
 */
export function extractFinancialSections(markdown: string, maxChars = 80000): string {
  // If already small enough, return as-is
  if (markdown.length <= maxChars) return markdown;

  // Split into sections on headings
  const sections = markdown.split(/(?=^#{1,4}\s)/m).filter((s) => s.trim().length > 0);

  // Score each section by financial keyword matches
  const scored = sections.map((section) => {
    const lower = section.toLowerCase();
    let score = 0;
    for (const kw of FINANCIAL_KEYWORDS) {
      // Count occurrences, weight heading matches higher
      const headingMatch = lower.slice(0, 200).includes(kw);
      const bodyMatches = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      score += headingMatch ? 10 : 0;
      score += bodyMatches;
    }
    // Boost sections with numbers and tables (likely financial data)
    const numberDensity = (section.match(/\d[\d\s,.]+\d/g) || []).length;
    const hasTable = section.includes("|") && section.includes("---");
    score += Math.min(numberDensity, 20); // cap at 20
    score += hasTable ? 5 : 0;

    return { section, score };
  });

  // Sort by score descending, take top sections up to budget
  scored.sort((a, b) => b.score - a.score);

  let totalChars = 0;
  const selected: { section: string; score: number }[] = [];

  for (const item of scored) {
    if (totalChars + item.section.length > maxChars) continue;
    selected.push(item);
    totalChars += item.section.length;
  }

  // Re-sort selected sections by their original document order
  const originalOrder = sections.map((s) => s);
  selected.sort(
    (a, b) => originalOrder.indexOf(a.section) - originalOrder.indexOf(b.section)
  );

  return selected.map((s) => s.section).join("\n\n");
}

const EXTRACTION_PROMPT = `Du er en ekspert på norsk finansanalyse. Analyser følgende utdrag fra en finansrapport og ekstraher alle tilgjengelige finansielle nøkkeltall.

Returner et JSON-objekt med denne strukturen:
{
  "period": "<rapporteringsperiode, f.eks. 'Q1 2025' eller 'Årsrapport 2024'>",
  "reportType": "<årsrapport|kvartalsrapport|prospekt|børsmelding|annet>",
  "metrics": [
    {
      "metricName": "<norsk navn>",
      "value": <numerisk verdi>,
      "unit": "<NOK|MNOK|BNOK|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
}

Bruk disse metrikknavnene der tilgjengelig:
- resultat: driftsinntekter, driftsresultat, ebitda, resultat_for_skatt, aarsresultat, resultat_per_aksje
- balanse: sum_eiendeler, egenkapital, total_gjeld, kontanter, egenkapitalandel
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad

Returner KUN gyldig JSON, ingen annen tekst.`;

export async function extractFinancialData(markdown: string): Promise<ExtractionResult> {
  const { openai } = await import("./openai");

  // Extract only financially relevant sections instead of sending entire document
  const financialContent = extractFinancialSections(markdown);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: financialContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Empty response from GPT-4o");

  const parsed = JSON.parse(content);
  const period = canonicalizePeriod(parsed.period || "");
  const reportType = parsed.reportType || "annet";

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

  if (rejected.length > 0) {
    console.warn("Rejected metrics:", rejected);
  }

  return {
    period,
    reportType,
    metrics: valid,
  };
}
