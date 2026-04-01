import { canonicalizePeriod } from "./period-format";
import { parseMarkdownTables } from "./table-parser";
import { classifyTable } from "./table-classifier";
import { resolveUnits } from "./unit-resolver";
import { buildStructuredInput } from "./structured-input";

export interface ExtractedMetric {
  metricName: string;
  sourceLabel?: string;
  value: number;
  unit: string;
  category: string;
  confidence: "high" | "medium" | "low";
  flagged?: boolean;
}

export interface ExtractionResult {
  period: string;
  reportType: string;
  periodScope?: "standalone" | "cumulative";
  periodEvidence?: string;
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
  "driftsinntekter", "sum_eiendeler", "kontanter", "goodwill",
  "varige_driftsmidler", "immaterielle_eiendeler", "varer", "kundefordringer",
];

/**
 * Balance sheet identity check: Assets ≈ Equity + Liabilities.
 * If sum_eiendeler deviates significantly from the expected value,
 * replace with computed sum and flag all three balance sheet metrics
 * for review. Only corrects when the ratio is extreme (>10x off),
 * suggesting a clear normalization error rather than accounting nuance.
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

  // Only auto-correct extreme deviations (>10x off = clear normalization bug).
  // Moderate deviations (0.8–1.2x) are normal rounding; 1.2–10x might be
  // a legitimate accounting difference or a bad equity/debt value — flag but don't fix.
  if (ratio < 0.1 || ratio > 10) {
    console.warn(
      `BALANCE SHEET FIX: sum_eiendeler=${assets.value} is ${ratio.toFixed(4)}x of ` +
      `egenkapital(${equity.value})+total_gjeld(${debt.value})=${expected.toFixed(3)}. ` +
      `Replacing with computed value.`
    );
    return metrics.map((m) => {
      if (m.metricName === "sum_eiendeler") {
        return { ...m, value: Math.round(expected * 1000) / 1000, confidence: "medium" as const, flagged: true };
      }
      if (m.metricName === "egenkapital" || m.metricName === "total_gjeld") {
        return { ...m, flagged: true };
      }
      return m;
    });
  }

  return metrics;
}

/**
 * Log warnings for expected metrics that are missing from extraction.
 * Does not block storage — informational only.
 */
export function checkCompleteness(
  metrics: ExtractedMetric[],
  structuredInput: string
): void {
  const expectedIfPresent: { metric: string; tableSignal: string }[] = [
    { metric: "driftsinntekter", tableSignal: "revenue" },
    { metric: "varekostnad", tableSignal: "cost of goods" },
    { metric: "personalkostnader", tableSignal: "employee benefit" },
    { metric: "avskrivninger", tableSignal: "depreciation" },
    { metric: "driftsresultat", tableSignal: "operating result" },
    { metric: "ebitda", tableSignal: "ebitda" },
    { metric: "finanskostnader", tableSignal: "finance cost" },
    { metric: "aarsresultat", tableSignal: "profit" },
    { metric: "sum_eiendeler", tableSignal: "total assets" },
    { metric: "egenkapital", tableSignal: "total equity" },
    { metric: "total_gjeld", tableSignal: "total liabilities" },
    { metric: "operasjonell_kontantstrom", tableSignal: "operating activities" },
  ];

  const inputLower = structuredInput.toLowerCase();
  const extractedNames = new Set(metrics.map((m) => m.metricName));

  for (const { metric, tableSignal } of expectedIfPresent) {
    if (!extractedNames.has(metric) && inputLower.includes(tableSignal)) {
      console.warn(
        `[completeness] "${metric}" missing from extraction but "${tableSignal}" present in input`
      );
    }
  }
}

/**
 * Compare new metrics against historical values for the same company.
 * Logs warnings for suspicious magnitude changes (>10x).
 */
export function checkMagnitude(
  newMetrics: ExtractedMetric[],
  historicalMetrics: { metricName: string; value: number }[]
): void {
  if (historicalMetrics.length === 0) return;

  const histMap = new Map<string, number>();
  for (const m of historicalMetrics) {
    histMap.set(m.metricName, m.value);
  }

  for (const metric of newMetrics) {
    const hist = histMap.get(metric.metricName);
    if (hist === undefined || hist === 0 || metric.unit === "%") continue;
    const ratio = Math.abs(metric.value / hist);
    if (ratio > 10 || ratio < 0.1) {
      console.warn(
        `[magnitude] "${metric.metricName}" changed ${ratio.toFixed(1)}x: ` +
        `${hist} → ${metric.value} ${metric.unit}`
      );
    }
  }
}

export function validateMetrics(metrics: ExtractedMetric[]): ValidationResult {
  const fixed = fixBalanceSheetMagnitude(metrics);

  const valid: ExtractedMetric[] = [];
  const rejected: { metric: ExtractedMetric; reason: string }[] = [];

  // Build lookup for cross-metric checks
  const byName = new Map<string, ExtractedMetric>();
  for (const m of fixed) byName.set(m.metricName, m);

  for (const metric of fixed) {
    // Percentage range: reject if |value| > 200
    if (metric.unit === "%" && Math.abs(metric.value) > 200) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value}% exceeds ±200%` });
      continue;
    }

    // Non-negative check
    if (NON_NEGATIVE_METRICS.includes(metric.metricName) && metric.value < 0) {
      rejected.push({ metric, reason: `${metric.metricName}: unexpected negative value ${metric.value}` });
      continue;
    }

    // Ratio range: gjeldsgrad should not exceed 100x
    if (metric.metricName === "gjeldsgrad" && (metric.value > 100 || metric.value < -10)) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value} outside valid range` });
      continue;
    }

    // EPS sanity: reject if |value| > 10000 (likely unit error)
    if (metric.metricName === "resultat_per_aksje" && Math.abs(metric.value) > 10000) {
      rejected.push({ metric, reason: `${metric.metricName}: value ${metric.value} likely unit error` });
      continue;
    }

    // Cross-metric: operating profit should not exceed revenue
    if (metric.metricName === "driftsresultat") {
      const revenue = byName.get("driftsinntekter");
      if (revenue && revenue.unit !== "%" && metric.unit !== "%" && Math.abs(metric.value) > Math.abs(revenue.value) * 1.05) {
        rejected.push({ metric, reason: `driftsresultat (${metric.value}) exceeds driftsinntekter (${revenue.value})` });
        continue;
      }
    }

    // Cross-metric: gross profit should not exceed revenue
    if (metric.metricName === "bruttofortjeneste") {
      const revenue = byName.get("driftsinntekter");
      if (revenue && revenue.unit !== "%" && metric.unit !== "%" && metric.value > revenue.value * 1.05) {
        rejected.push({ metric, reason: `bruttofortjeneste (${metric.value}) exceeds driftsinntekter (${revenue.value})` });
        continue;
      }
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

function extractFinancialSections(markdown: string, maxChars = 80000): string {
  // Very short documents don't need section filtering
  if (markdown.length <= 10000) return markdown;

  // Split into sections on headings
  const sections = markdown.split(/(?=^#{1,4}\s)/m).filter((s) => s.trim().length > 0);

  // If no headings found (single section), return as-is to avoid truncation
  if (sections.length <= 1 && markdown.length <= maxChars) return markdown;

  // Score each section by financial keyword matches
  const scored = sections.map((section, idx) => {
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

    return { section: trimmed, score, originalIdx: idx };
  });

  // Sort by score descending, take top sections up to budget
  scored.sort((a, b) => b.score - a.score);

  let totalChars = 0;
  const selected: { section: string; score: number; originalIdx: number }[] = [];

  for (const item of scored) {
    if (totalChars + item.section.length > maxChars) continue;
    selected.push(item);
    totalChars += item.section.length;
  }

  // Re-sort selected sections by their original document order
  selected.sort((a, b) => a.originalIdx - b.originalIdx);

  return selected.map((s) => s.section).join("\n\n");
}

export function prepareStructuredInput(markdown: string): { content: string; usedStructuredPath: boolean } {
  const tables = parseMarkdownTables(markdown);
  const classified = tables.map((table) => ({
    table,
    classification: classifyTable(table),
  }));
  const resolved = resolveUnits(classified);
  const structured = buildStructuredInput(resolved);

  if (!structured) {
    return {
      content: stripCommasOnly(extractFinancialSections(markdown)),
      usedStructuredPath: false,
    };
  }

  return {
    content: stripNumericSeparators(structured),
    usedStructuredPath: true,
  };
}

const EXTRACTION_PROMPT = `Du er en ekspert på norsk finansanalyse.

Du mottar ferdig strukturerte finansielle tabeller (resultatregnskap, balanse, kontantstrøm) med eksplisitt enhetsangivelse. Tabellene er allerede identifisert og klassifisert — du trenger IKKE lete etter dem.

OPPGAVE 0 — BESTEM RAPPORTTYPE:
Avgjør FØRST om dette er en årsrapport eller kvartalsrapport:
- Årsrapport: dokumenttittel/overskrift inneholder "Annual Report", "Årsrapport", "Annual Results", "Full Year", eller tabellene har KUN helårskolonner (FY/12M) uten frittstående kvartalskolonner.
- Kvartalsrapport: dokumentet presenterer et enkelt kvartal som hovedperiode (Q1, Q2, Q3, Q4).
Sett "reportType" basert på dette.

OPPGAVE 1 — VELG RIKTIG KOLONNE:
- ÅRSRAPPORT: Bruk helårskolonnen (12M, FY, eller årskolonnen). IKKE bruk Q4 selv om den finnes — Q4 er kun et supplement i en årsrapport.
- KVARTALSRAPPORT: Bruk frittstående kvartalskolonne (IKKE kumulativ).
  - Hvis tabellen har BÅDE "Q4 2025" og "12M 2025": bruk "Q4 2025"
  - Hvis tabellen har BÅDE "2Q 2025" og "6M 2025": bruk "2Q 2025"
- Forveksle IKKE med forrige-års sammenligning (f.eks. "Q4 2024") — det er historisk data.

OPPGAVE 2 — STANDARDISER METRIKKNAVNENE:
Bruk KUN disse navnene:
- resultat: driftsinntekter, varekostnad, bruttofortjeneste, personalkostnader, andre_driftskostnader, avskrivninger, nedskrivninger, driftsresultat, ebitda, finansinntekter, finanskostnader, resultat_for_skatt, skattekostnad, aarsresultat, resultat_per_aksje
- balanse: goodwill, immaterielle_eiendeler, varige_driftsmidler, bruksrettseiendeler, andre_anleggsmidler, varer, kundefordringer, kontanter, sum_eiendeler, egenkapital, rentebærende_gjeld, annen_gjeld, total_gjeld
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad, egenkapitalandel

Kartlegging:
- Revenue / Total revenue / Omsetning / Driftsinntekter / Net sales → "driftsinntekter"
- Cost of goods sold / COGS / Raw materials / Varekostnad / Cost of sales → "varekostnad"
- Gross profit / Bruttofortjeneste → "bruttofortjeneste"
- Employee benefits / Personnel expenses / Lønnskostnader / Personalkostnader → "personalkostnader"
- Other operating expenses / Andre driftskostnader / Other OpEx → "andre_driftskostnader"
- Depreciation & amortisation / D&A / Avskrivninger (excl. impairment) → "avskrivninger"
- Impairment loss / Goodwill impairment / Write-down / Nedskrivning → "nedskrivninger"
- Operating profit / EBIT / Operating result / Driftsresultat → "driftsresultat"
- EBITDA / EBITDAR → "ebitda"
- Finance income / Interest income / Finansinntekter → "finansinntekter"
- Finance expense / Finance costs / Interest expense / Finanskostnader → "finanskostnader"
- Profit before tax / Resultat før skatt / EBT → "resultat_for_skatt"
- Income tax expense / Tax / Skattekostnad → "skattekostnad"
- Profit / Net income / Årsresultat → "aarsresultat"
- Earnings per share / Basic EPS / Resultat per aksje → "resultat_per_aksje"
- Goodwill → "goodwill"
- Intangible assets / Immaterielle eiendeler → "immaterielle_eiendeler"
- Property plant & equipment / PP&E / Varige driftsmidler → "varige_driftsmidler"
- Right-of-use assets / Bruksrettseiendeler / ROU assets → "bruksrettseiendeler"
- Other non-current assets / Andre anleggsmidler / Investments → "andre_anleggsmidler"
- Inventories / Varelager / Varer → "varer"
- Trade receivables / Accounts receivable / Kundefordringer → "kundefordringer"
- Cash / Cash and cash equivalents / Kontanter / Bankinnskudd → "kontanter"
- Total assets / Sum eiendeler → "sum_eiendeler"
- Total equity / Egenkapital / Shareholders' equity → "egenkapital"
- Interest-bearing debt / Rentebærende gjeld / Financial liabilities → "rentebærende_gjeld"
- Other liabilities / Trade payables / Annen gjeld / Non-interest-bearing → "annen_gjeld"
- Total liabilities / Total gjeld / Sum gjeld → "total_gjeld"
- Cash from operating activities → "operasjonell_kontantstrom"
- Cash from investing activities → "investeringsaktiviteter"
- Cash from financing activities → "finansieringsaktiviteter"
- Free cash flow / FCF → "fri_kontantstrom"
- Net change in cash / Netto endring kontanter → "netto_endring_kontanter"

OPPGAVE 3 — NORMALISER VERDIER:
Enheten for hver tabell er oppgitt i inndataen. Bruk den til å konvertere til MILLIONER.
- Komma er allerede fjernet fra tall. Alle tall er rene (f.eks. 1252560).
- Negative tall kan vises som (tall) eller -tall.
- Behold full presisjon: 125897 i tusen → 125.897 MNOK, IKKE 126 MNOK.

OPPGAVE 4 — BEKREFT VALUTA:
Valutaen er allerede detektert fra tabelloverskriftene og oppgitt i enhetskonteksten ovenfor. Bruk denne. Hvis enhetskonteksten ikke inneholder valuta, se etter valutaindikatorer i tabellene (NOK, EUR, USD, SEK, etc.).

Returner et JSON-objekt:
{
  "period": "<rapporteringsperiode, f.eks. 'Q4 2025' eller '1Q 2025'>",
  "reportType": "<årsrapport|kvartalsrapport|prospekt|børsmelding|annet>",
  "periodScope": "<standalone|cumulative>",
  "periodEvidence": "<EKSAKT kolonneoverskrift du hentet verdier fra>",
  "currency": "<NOK|EUR|USD|SEK|DKK|GBP>",
  "originalUnit": "<enhet fra inndataen, f.eks. thousands, millions>",
  "unitEvidence": "<enhetsbeskrivelse fra inndataen>",
  "metrics": [
    {
      "metricName": "<standardisert navn>",
      "sourceLabel": "<EKSAKT label fra kildetabellen, f.eks. 'Raw materials and consumables used'>",
      "value": <numerisk verdi i millioner>,
      "unit": "<MNOK|MEUR|MUSD|MSEK|MDKK|MGBP|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
}

Returner KUN gyldig JSON, ingen annen tekst.`;

const FALLBACK_EXTRACTION_PROMPT = `Du er en ekspert på norsk finansanalyse.

Du mottar en USTRUKTURERT finansrapport som ren tekst (ikke tabeller). Finansielle data er spredt i dokumentet som rader med plassseparerte verdier.

OPPGAVE 1 — FINN FINANSOPPSTILLINGENE:
Let etter seksjoner merket "Income statement", "Resultatregnskap", "Statement of financial position", "Balanse", "Statement of cash flows", "Kontantstrøm" eller lignende overskrifter.

OPPGAVE 0 — BESTEM RAPPORTTYPE:
Avgjør FØRST om dette er en årsrapport eller kvartalsrapport:
- Årsrapport: dokumenttittel/overskrift inneholder "Annual Report", "Årsrapport", "Annual Results", "Full Year", eller dataene dekker kun helårsperioder.
- Kvartalsrapport: dokumentet presenterer et enkelt kvartal som hovedperiode.
Sett "reportType" basert på dette.

OPPGAVE 2 — FORSTÅ KOLONNENE:
Dataradene har formatet: Label verdi1 verdi2 verdi3...
- ÅRSRAPPORT: Første verdi er helårstallet. Bruk det.
- KVARTALSRAPPORT: Første verdi er for gjeldende periode (frittstående kvartal).
IGNORER alle andre verdier — de er sammenligningsperioder.

OPPGAVE 3 — STANDARDISER METRIKKNAVNENE:
Bruk KUN disse navnene:
- resultat: driftsinntekter, varekostnad, bruttofortjeneste, personalkostnader, andre_driftskostnader, avskrivninger, nedskrivninger, driftsresultat, ebitda, finansinntekter, finanskostnader, resultat_for_skatt, skattekostnad, aarsresultat, resultat_per_aksje
- balanse: goodwill, immaterielle_eiendeler, varige_driftsmidler, bruksrettseiendeler, andre_anleggsmidler, varer, kundefordringer, kontanter, sum_eiendeler, egenkapital, rentebærende_gjeld, annen_gjeld, total_gjeld
- kontantstrøm: operasjonell_kontantstrom, investeringsaktiviteter, finansieringsaktiviteter, fri_kontantstrom, netto_endring_kontanter
- nøkkeltall: driftsmargin, ebitda_margin, netto_margin, roe, roa, gjeldsgrad, egenkapitalandel

Kartlegging:
- Revenue / Total revenue / Operating revenues → "driftsinntekter"
- Cost of goods sold / COGS / Raw materials → "varekostnad"
- Gross profit / Bruttofortjeneste → "bruttofortjeneste"
- Employee benefits / Personnel expenses / Lønnskostnader → "personalkostnader"
- Other operating expenses / Andre driftskostnader → "andre_driftskostnader"
- Depreciation & amortisation / D&A / Avskrivninger → "avskrivninger"
- Impairment loss / Goodwill impairment / Write-down / Nedskrivning → "nedskrivninger"
- Operating profit / EBIT / Operating result / Operating profit / loss → "driftsresultat"
- Gross operating profit / EBITDA → "ebitda"
- Finance income / Interest income / Finansinntekter → "finansinntekter"
- Finance expense / Finance costs / Interest expense / Finanskostnader → "finanskostnader"
- Profit before tax / Profit / loss before taxes → "resultat_for_skatt" (bruk TOTAL, inkludert discontinued operations)
- Income tax expense / Tax / Skattekostnad → "skattekostnad"
- Profit / loss / Net income / Profit for the period → "aarsresultat" (bruk TOTAL Profit/loss, IKKE bare "from continuing operations")
- Earnings per share / Basic EPS → "resultat_per_aksje" (bruk TOTAL, ikke bare continuing operations)
- Goodwill → "goodwill"
- Intangible assets / Immaterielle eiendeler → "immaterielle_eiendeler"
- Property plant & equipment / PP&E / Varige driftsmidler → "varige_driftsmidler"
- Right-of-use assets / Bruksrettseiendeler → "bruksrettseiendeler"
- Other non-current assets / Andre anleggsmidler → "andre_anleggsmidler"
- Inventories / Varelager → "varer"
- Trade receivables / Accounts receivable / Kundefordringer → "kundefordringer"
- Cash / Cash and cash equivalents / Kontanter → "kontanter"
- Total assets / Sum eiendeler → "sum_eiendeler"
- Equity / Total equity / Equity attributable to owners → "egenkapital" (bruk TOTAL equity inkl. non-controlling interests)
- Interest-bearing debt / Rentebærende gjeld / Financial liabilities → "rentebærende_gjeld"
- Other liabilities / Trade payables / Annen gjeld → "annen_gjeld"
- Total liabilities → "total_gjeld" (beregn som Total assets - Equity hvis ikke oppgitt direkte)
- Net cash flow from operating activities → "operasjonell_kontantstrom" (bruk TOTAL, ikke bare continuing operations)
- Net cash flow from investing activities → "investeringsaktiviteter" (bruk TOTAL)
- Net cash flow from financing activities → "finansieringsaktiviteter" (bruk TOTAL)
- Free cash flow / FCF → "fri_kontantstrom"
- Net increase / decrease in cash → "netto_endring_kontanter"

VIKTIG OM DISCONTINUED OPERATIONS:
Noen selskaper har "discontinued operations". Bruk ALLTID totaltallene (continuing + discontinued), IKKE bare "from continuing operations". Linjen "Profit / loss (-)" eller "Profit for the period" er totalen.

OPPGAVE 4 — NORMALISER VERDIER:
Se etter enhetsangivelse som "(NOK million)", "(NOK 1000)", "EUR'000" etc.
- Kommaer i tall er tusenskilletegn: 1,694 = 1694
- Negative tall kan vises som (tall) eller -tall
- Behold full presisjon

OPPGAVE 5 — FINN VALUTA:
Se etter valutaindikatorer (NOK, EUR, USD, SEK, etc.)

Returner et JSON-objekt:
{
  "period": "<rapporteringsperiode, f.eks. 'Q2 2025'>",
  "reportType": "<årsrapport|kvartalsrapport|prospekt|børsmelding|annet>",
  "periodScope": "<standalone|cumulative>",
  "periodEvidence": "<EKSAKT tekst som viser perioden>",
  "currency": "<NOK|EUR|USD|SEK|DKK|GBP>",
  "originalUnit": "<enhet, f.eks. million, thousands>",
  "unitEvidence": "<enhetsbeskrivelse>",
  "metrics": [
    {
      "metricName": "<standardisert navn>",
      "sourceLabel": "<EKSAKT label fra kildeteksten>",
      "value": <numerisk verdi i millioner>,
      "unit": "<MNOK|MEUR|MUSD|MSEK|MDKK|MGBP|%|x>",
      "category": "<resultat|balanse|kontantstrøm|nøkkeltall>",
      "confidence": "<high|medium|low>"
    }
  ]
}

Returner KUN gyldig JSON, ingen annen tekst.`;

/**
 * Strip comma thousand separators from numbers.
 * "1,252,560" → "1252560". Preserves commas in non-numeric contexts.
 * Safe for both structured tables and raw flat text.
 */
function stripCommasOnly(text: string): string {
  return text.replace(/\b(\d{1,3})(,\d{3})+\b/g, (match) =>
    match.replace(/,/g, "")
  );
}

/**
 * Strip BOTH comma and space thousand separators from numbers.
 * "1,252,560" → "1252560", "1 338 842" → "1338842"
 * ONLY safe for structured table output where each cell has one number.
 * DO NOT use on flat text where multiple values are space-separated.
 */
function stripNumericSeparators(text: string): string {
  text = stripCommasOnly(text);
  text = text.replace(/\b(\d{1,3})((?:\s\d{3})+)\b/g, (match, first, rest) =>
    first + rest.replace(/\s/g, "")
  );
  return text;
}

/**
 * Cross-validate reportType against the canonicalized period.
 * FY period → must be årsrapport; quarterly period → must be kvartalsrapport.
 */
function reconcileReportType(period: string, reportType: string): string {
  if (period.endsWith("-FY")) return "årsrapport";
  if (/-Q[1-4]$/.test(period) && reportType === "årsrapport") return "kvartalsrapport";
  return reportType;
}

export async function extractFinancialData(markdown: string): Promise<ExtractionResult> {
  const { getOpenAI } = await import("./openai");

  // Extract only financially relevant sections instead of sending entire document
  const { content: financialContent, usedStructuredPath } = prepareStructuredInput(markdown);
  const prompt = usedStructuredPath ? EXTRACTION_PROMPT : FALLBACK_EXTRACTION_PROMPT;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: financialContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Empty response from GPT-4o");

  const parsed = JSON.parse(content);
  const period = canonicalizePeriod(parsed.period || "");
  const reportType = reconcileReportType(period, parsed.reportType || "annet");
  const currency = parsed.currency || undefined;
  const originalUnit = parsed.originalUnit || undefined;
  const unitEvidence = parsed.unitEvidence || undefined;
  const periodScope = (parsed.periodScope === "cumulative" ? "cumulative" : "standalone") as "standalone" | "cumulative";
  const periodEvidence = parsed.periodEvidence || undefined;

  if (unitEvidence) {
    console.log(`[unit-detection] currency=${currency}, originalUnit=${originalUnit}, evidence="${unitEvidence}"`);
  }

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

  if (rejected.length > 0) {
    console.warn("Rejected metrics:", rejected);
  }

  checkCompleteness(valid, financialContent);

  return {
    period,
    reportType,
    periodScope,
    periodEvidence,
    currency,
    originalUnit,
    unitEvidence,
    metrics: valid,
  };
}

/**
 * Re-extract with feedback about missing metrics.
 * Prepends missing-metric hints to the system prompt.
 */
export async function extractWithFeedback(
  markdown: string,
  missing: string[]
): Promise<ExtractionResult> {
  const { getOpenAI } = await import("./openai");

  const { content: financialContent, usedStructuredPath } = prepareStructuredInput(markdown);
  const basePrompt = usedStructuredPath ? EXTRACTION_PROMPT : FALLBACK_EXTRACTION_PROMPT;
  const feedbackNote = `VIKTIG: Forrige ekstraksjonsforsøk manglet disse metrikkene som finnes i inndataen: ${missing.join(", ")}. Sørg for å ekstrahere ALLE tilgjengelige metrikker.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: feedbackNote + "\n\n" + basePrompt },
      { role: "user", content: financialContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Empty response from GPT-4o");

  const parsed = JSON.parse(content);
  const period = canonicalizePeriod(parsed.period || "");
  const reportType = reconcileReportType(period, parsed.reportType || "annet");
  const currency = parsed.currency || undefined;
  const originalUnit = parsed.originalUnit || undefined;
  const unitEvidence = parsed.unitEvidence || undefined;
  const periodScope = (parsed.periodScope === "cumulative" ? "cumulative" : "standalone") as "standalone" | "cumulative";
  const periodEvidence = parsed.periodEvidence || undefined;

  const { valid, rejected } = validateMetrics(parsed.metrics || []);

  return {
    period,
    reportType,
    periodScope,
    periodEvidence,
    currency,
    originalUnit,
    unitEvidence,
    metrics: valid,
  };
}
