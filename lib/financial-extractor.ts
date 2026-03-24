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
  currency?: string;
  originalUnit?: string;
  unitEvidence?: string;
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

KRITISK — ENHETDETEKSJON (gjør dette FØR du leser av noen tall):
Ulike rapporter bruker forskjellige skalaer. Du MÅ identifisere skalaen FØRST ved å søke etter disse mønstrene i tabelloverskrifter, fotnoter, og starten av finansielle seksjoner:

Tusen-indikatorer (del tallene på 1 000 for å normalisere til millioner):
  - "Beløp i tusen" / "Amounts in thousands" / "in EUR thousands" / "in USD thousands"
  - TNOK, TEUR, TSEK, TDKK, TUSD, TGBP
  - "'000" / "(000s)" / "NOK 1 000" / "EUR 1 000" / "EUR'000" / "USD'000"
  - "T€" / "T$" / "Tkr"
  - Tabelloverskrift med "(tusen)" / "(thousands)" / "(in thousands)"
  - "Tall i tusen" / "Figures in thousands" / "Expressed in thousands"

Million-indikatorer (bruk tallene direkte):
  - "Beløp i millioner" / "Amounts in millions" / "in EUR millions"
  - MNOK, MEUR, MSEK, MDKK, MUSD, MGBP
  - "mill." / "mill. kr" / "mKR" / "mill. NOK" / "mill. EUR"
  - "M€" / "M$" / "Mkr"
  - "Figures in millions" / "Expressed in millions"

Milliard-indikatorer (gang tallene med 1 000 for å normalisere til millioner):
  - "mrd." / "mrd. kr" / "milliarder" / "billions" / "BNOK" / "BEUR" / "BUSD"

Hele enheter (del tallene på 1 000 000 for å normalisere til millioner):
  - Ingen av mønstrene ovenfor funnet i dokumentet
  - Tall har typisk 6+ sifre for inntekter/eiendeler hos mellomstore/store selskaper

VIKTIG: Sitatbevis er PÅKREVD. Du MÅ finne og sitere den eksakte teksten som viser enheten.

NORMALISERING:
Alle pengeverdier skal normaliseres til MILLIONER av selskapets rapporteringsvaluta.

Steg 1: Finn selskapets rapporteringsvaluta (NOK, EUR, USD, GBP, SEK, DKK, etc.)
  - Se etter "Beløp i...", "Amounts in...", valutasymboler, eller tabelloverskrifter
  - IKKE konverter mellom valutaer — behold selskapets egen valuta

Steg 2: Bruk skalaen du identifiserte ovenfor til å normalisere:
  - Hele kroner/currency → del på 1 000 000
  - Tusen (TNOK/'000 etc.) → del på 1 000
  - Millioner (MNOK/mill. etc.) → bruk direkte
  - Milliarder (mrd./BNOK etc.) → gang med 1 000
  - Prosenter og forholdstall → behold som de er

Steg 3: Bruk riktig enhetslabel: MNOK, MEUR, MUSD, MGBP, MSEK, MDKK, etc.

Returner et JSON-objekt med denne strukturen:
{
  "period": "<rapporteringsperiode, f.eks. 'Q1 2025' eller 'Årsrapport 2024'>",
  "reportType": "<årsrapport|kvartalsrapport|prospekt|børsmelding|annet>",
  "currency": "<selskapets rapporteringsvaluta, f.eks. NOK, EUR, USD>",
  "originalUnit": "<opprinnelig enhet i rapporten, f.eks. hele EUR, TEUR, MEUR, NOK'000>",
  "unitEvidence": "<EKSAKT sitat fra dokumentet som viser enheten, f.eks. 'Amounts in EUR thousands'. Hvis ikke funnet: 'Ingen eksplisitt enhet funnet — antatt hele [valuta]'>",
  "metrics": [
    {
      "metricName": "<norsk navn>",
      "value": <numerisk verdi i millioner av rapporteringsvaluta for pengeverdier, eller original verdi for prosenter/forholdstall>,
      "unit": "<MNOK|MEUR|MUSD|MSEK|MDKK|MGBP|%|x>",
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
  const { getOpenAI } = await import("./openai");

  // Extract only financially relevant sections instead of sending entire document
  const financialContent = extractFinancialSections(markdown);

  const response = await getOpenAI().chat.completions.create({
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
  const currency = parsed.currency || undefined;
  const originalUnit = parsed.originalUnit || undefined;
  const unitEvidence = parsed.unitEvidence || undefined;

  if (unitEvidence) {
    console.log(`[unit-detection] currency=${currency}, originalUnit=${originalUnit}, evidence="${unitEvidence}"`);
  }

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

  if (rejected.length > 0) {
    console.warn("Rejected metrics:", rejected);
  }

  return {
    period,
    reportType,
    currency,
    originalUnit,
    unitEvidence,
    metrics: valid,
  };
}
