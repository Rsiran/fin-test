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

/**
 * Balance sheet identity check: Assets ≈ Equity + Liabilities.
 * If sum_eiendeler deviates significantly, replace with the computed sum.
 * This catches LLM normalization errors (wrong divisor, comma misreads).
 */
function fixBalanceSheetMagnitude(metrics: ExtractedMetric[]): ExtractedMetric[] {
  const find = (name: string) => metrics.find((m) => m.metricName === name);
  const assets = find("sum_eiendeler");
  const equity = find("egenkapital");
  const debt = find("total_gjeld");

  if (!assets || !equity || !debt) return metrics;
  if (assets.unit === "%" || equity.unit === "%" || debt.unit === "%") return metrics;

  const expected = equity.value + debt.value;
  if (expected === 0) return metrics;

  const ratio = assets.value / expected;

  // If assets are way off (not within 0.8x – 1.2x of equity+debt), replace with computed value
  if (ratio < 0.8 || ratio > 1.2) {
    console.warn(
      `MAGNITUDE FIX: sum_eiendeler=${assets.value} deviates from ` +
      `egenkapital(${equity.value})+total_gjeld(${debt.value})=${expected.toFixed(3)}. ` +
      `Ratio=${ratio.toFixed(4)}. Replacing with computed value.`
    );
    return metrics.map((m) =>
      m.metricName === "sum_eiendeler"
        ? { ...m, value: Math.round(expected * 1000) / 1000, confidence: "medium" as const }
        : m
    );
  }

  return metrics;
}

export function validateMetrics(metrics: ExtractedMetric[]): ValidationResult {
  // First fix any magnitude errors using accounting identities
  const fixed = fixBalanceSheetMagnitude(metrics);

  const valid: ExtractedMetric[] = [];
  const rejected: { metric: ExtractedMetric; reason: string }[] = [];

  for (const metric of fixed) {
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
  // APM / non-IFRS sections (often contain EBITDA tables)
  "alternative performance", "non-ifrs", "non-gaap", "adjusted ebitda",
  "performance measures", "reconciliation",
];

/**
 * Extract only the financially relevant sections from a large document.
 * Splits on headings, scores each section by keyword density, returns
 * the top sections up to a token budget.
 *
 * Sections exceeding MAX_SECTION_CHARS are truncated to prevent a single
 * bloated section (e.g. "General Information") from monopolising the budget
 * and crowding out smaller but critical sections (e.g. APM / EBITDA tables).
 */
const MAX_SECTION_CHARS = 15_000;

export function extractFinancialSections(markdown: string, maxChars = 80000): string {
  // If already small enough, return as-is
  if (markdown.length <= maxChars) return markdown;

  // Split into sections on headings
  const sections = markdown.split(/(?=^#{1,4}\s)/m).filter((s) => s.trim().length > 0);

  // Score each section by financial keyword matches
  const scored = sections.map((section) => {
    // Truncate oversized sections — keep heading + first N chars
    const trimmed = section.length > MAX_SECTION_CHARS
      ? section.slice(0, MAX_SECTION_CHARS) + "\n[…truncated…]"
      : section;

    const lower = trimmed.toLowerCase();
    let score = 0;
    for (const kw of FINANCIAL_KEYWORDS) {
      // Count occurrences, weight heading matches higher
      const headingMatch = lower.slice(0, 200).includes(kw);
      const bodyMatches = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      score += headingMatch ? 10 : 0;
      score += bodyMatches;
    }
    // Boost sections with numbers and tables (likely financial data)
    const numberDensity = (trimmed.match(/\d[\d\s,.]+\d/g) || []).length;
    const hasTable = trimmed.includes("|") && trimmed.includes("---");
    score += Math.min(numberDensity, 20); // cap at 20
    score += hasTable ? 5 : 0;

    return { section: trimmed, score };
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
    (a, b) => {
      const aIdx = originalOrder.findIndex((o) => a.section.startsWith(o.slice(0, 200)));
      const bIdx = originalOrder.findIndex((o) => b.section.startsWith(o.slice(0, 200)));
      return aIdx - bIdx;
    }
  );

  return selected.map((s) => s.section).join("\n\n");
}

const EXTRACTION_PROMPT = `Du er en ekspert på norsk finansanalyse. Analyser følgende utdrag fra en finansrapport og ekstraher alle tilgjengelige finansielle nøkkeltall.

KRITISK REGEL 1 — BRUK ALLTID TABELLVERDIER, IKKE NARRATIV TEKST:
Finansrapporter inneholder både presis tabelldata og avrundede narrative oppsummeringer.
Du MÅ ALLTID hente tall fra finansielle tabeller/oppstillinger (resultatregnskap, balanse, kontantstrøm, APM-tabeller), ALDRI fra løpende tekst som "amounted to EUR 126 million".
- Tabellverdier er presise (f.eks. 125,897 i EUR'000 = 125.897 MEUR)
- Narrative verdier er avrundet (f.eks. "EUR 126 million") og skal IGNORERES
- Hvis en tabell og narrativ tekst gir forskjellige tall, bruk ALLTID tabellverdien

KRITISK REGEL 2 — ENHETDETEKSJON (gjør dette FØR du leser av noen tall):
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

KRITISK REGEL 3 — TALLPARSING (komma vs. desimaltegn):
I engelskspråklige finansrapporter er komma ALLTID tusenskilletegn, ALDRI desimaltegn.
  - "1,252,560" = én million to hundre og femtito tusen fem hundre og seksti (1252560)
  - "670,030" = seks hundre og sytti tusen og tretti (670030)
  - "125,897" = ett hundre og tjuefem tusen åtte hundre og nittisyv (125897)
Desimaltegn i disse rapportene er alltid punktum (.).
Eksempler på normalisering fra EUR'000:
  - "1,252,560" → 1252560 / 1000 = 1252.560 MEUR
  - "125,897" → 125897 / 1000 = 125.897 MEUR
  - "670,030" → 670030 / 1000 = 670.030 MEUR

KRITISK REGEL 4 — METRIKKNAVNSTANDARDISERING:
Bruk KUN metrikknavnene listet nedenfor. Hvis rapporten bruker en variant:
  - EBITDAR, EBITDA (before rent) → bruk "ebitda" (legg til confidence "medium" og noter varianten)
  - Driftsinntekter / Revenue / Total revenue / Omsetning → bruk "driftsinntekter"
  - Operating profit / EBIT → bruk "driftsresultat"
Hent alltid verdien for GJELDENDE rapporteringsperiode. Ikke hent historiske sammenligningsperioder.

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

PRESISJON: Behold full presisjon fra tabellverdien. Eksempel: 125897 EUR'000 → 125.897 MEUR (IKKE 126 MEUR).

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

/**
 * Strip commas from numbers in financial text to prevent LLM parsing errors.
 * "1,252,560" → "1252560", "EUR 1,253 million" → "EUR 1253 million"
 * Preserves commas in non-numeric contexts (e.g. natural language).
 */
function stripNumericCommas(text: string): string {
  // Match numbers with comma-separated groups: 1,252,560 or 670,030
  return text.replace(/\b(\d{1,3})(,\d{3})+\b/g, (match) =>
    match.replace(/,/g, "")
  );
}

export async function extractFinancialData(markdown: string): Promise<ExtractionResult> {
  const { getOpenAI } = await import("./openai");

  // Extract only financially relevant sections instead of sending entire document
  const financialContent = stripNumericCommas(extractFinancialSections(markdown));

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
