const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");

function loadPackage(name) {
  try {
    return require(name);
  } catch (error) {
    const fallback = path.join(__dirname, "..", "..", "presentation-ai", "node_modules", name);
    return require(fallback);
  }
}

const PptxGenJS = loadPackage("pptxgenjs");
const TEMPLATE_BLUE_BG_PATH = path.join(__dirname, "..", "assets", "qbr-bg-blue.png");
const TEMPLATE_LIGHT_BG_PATH = path.join(__dirname, "..", "assets", "qbr-bg-light.png");
const HAS_TEMPLATE_BLUE_BG = fsSync.existsSync(TEMPLATE_BLUE_BG_PATH);
const HAS_TEMPLATE_LIGHT_BG = fsSync.existsSync(TEMPLATE_LIGHT_BG_PATH);
const KPI_ICON_PATHS = {
  sales: path.join(__dirname, "..", "assets", "kpi-icon-sales.png"),
  ordervalue: path.join(__dirname, "..", "assets", "kpi-icon-ordervalue.png"),
  aov: path.join(__dirname, "..", "assets", "kpi-icon-aov.png"),
  convrate: path.join(__dirname, "..", "assets", "kpi-icon-convrate.png"),
  roi: path.join(__dirname, "..", "assets", "kpi-icon-roi.png")
};
const HAS_KPI_ICON = Object.fromEntries(
  Object.entries(KPI_ICON_PATHS).map(([key, filePath]) => [key, fsSync.existsSync(filePath)])
);

const TEXT_REPLACEMENTS = [
  [/Ãƒâ€šÃ‚Â£|ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£|ÃƒÂÃ¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÂÃ¢â‚¬â„¢ÃƒÂÃ‹â€ |ÃƒÂÃ‹â€ /g, "\u00A3"],
  [/Ãƒâ€šÃ¢â€šÂ¬|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬|ÃƒÂÃ¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÂÃ¢â‚¬â„¢Ãƒâ€šÃ‚Â¤/g, "\u20AC"],
  [/Ãƒâ€šÃ‚Â¥/g, "\u00A5"],
  [/Ãƒâ€š/g, ""],
  [/Ãƒâ€šÃ‚Â /g, " "],
  [/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â/g, "-"],
  [/ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢/g, "'"],
  [/ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÂ¢Ã¢â€šÂ¬Ã¯Â¿Â½/g, '"'],
  [/zÃƒâ€¦Ã¢â‚¬Å¡|zÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡/g, "z\u0142"]
];

const TABLE_KEY_MAP = {
  top10increase: "topGrowthPublishers",
  topgrowthpublishers: "topGrowthPublishers",
  top10decrease: "topDecliningPublishers",
  topdecliningpublishers: "topDecliningPublishers",
  top10byov: "topCurrentPerformers",
  topcurrentperformers: "topCurrentPerformers",
  segmentsummary: "segmentSnapshot",
  moversshakerssales: "moversSales",
  moversshakersov: "moversOrderValue",
  moversshakersclicks: "moversClicks",
  moversshakersaov: "moversAov",
  brandnewtop: "brandNewPublishers",
  newemergingtop: "newEmergingPublishers",
  stoppedactivitytop: "stoppedActivity",
  newpublisherprospects: "newPublisherProspects",
  publisherperformancesummarytable: "publisherPerformanceSummary",
  kpisummarytable: "kpiSummary",
  programlevelbreakdown: "programLevelBreakdown",
  kpihighlightstable: "kpiHighlights",
  kpihighlightnarrativetable: "kpiHighlightNarrative",
  kpihighlightnarrative: "kpiHighlightNarrative",
  kpivariancecolorhintstable: "kpiVarianceColorHints",
  kpivariancecolorhints: "kpiVarianceColorHints",
  moversshakerscommission: "moversCommission",
  brandnewprogramstable: "brandNewPrograms",
  salesgrowthsignalstable: "salesGrowthSignals",
  riskdependenciestable: "riskDependencies",
  publisherperformancesummary: "publisherPerformanceSummary",
  kpisummary: "kpiSummary",
  programlevelbreakdown: "programLevelBreakdown",
  kpihighlights: "kpiHighlights",
  moverscommission: "moversCommission",
  moverssales: "moversSales",
  moversclicks: "moversClicks",
  brandnewprograms: "brandNewPrograms",
  salesgrowthsignals: "salesGrowthSignals",
  riskdependencies: "riskDependencies"
};

const PROGRAM_BREAKDOWN_COLUMNS = [
  { label: "Program", aliases: ["Program", "Program Name", "ProgramName", "Name"] },
  { label: "Program ID", aliases: ["Program ID", "ProgramId", "ProgramID", "ID"] },
  { label: "Current OV", aliases: ["Current OV", "Current Order Value", "Order Value", "CurrentOrderValue", "CurrentOV"] },
  { label: "OV YoY %", aliases: ["OV YoY %", "Order Value YoY %", "OV % YoY", "OVYoY%", "Ov YoY %"] },
  { label: "Current Sales", aliases: ["Current Sales", "Sales", "CurrentSales"] },
  { label: "Sales YoY %", aliases: ["Sales YoY %", "Current Sales YoY %", "Sales % YoY", "SalesYoY%"] }
];

const DEFAULT_THEME = {
  id: "td-default",
  name: "TD",
  companyName: "Tradedoubler",
  logoText: "Tradedoubler",
  fonts: {
    heading: "Instrument Sans",
    body: "Instrument Sans",
    mono: "Instrument Sans"
  },
  colors: {
    ink: "#2F333B",
    paper: "#F3F4F6",
    canvas: "#E8EDF9",
    accent: "#2F6FF2",
    accentAlt: "#EB5757",
    success: "#57A66C",
    warning: "#F2C94C",
    highlight: "#AFC4F5",
    muted: "#5B6372",
    border: "#D8DCE5"
  }
};

const LANGUAGE_LOCALE_MAP = {
  EN: "en-GB",
  FR: "fr-FR",
  NL: "nl-NL",
  DE: "de-DE",
  IT: "it-IT",
  NO: "nb-NO",
  SV: "sv-SE",
  DA: "da-DK",
  FI: "fi-FI",
  ES: "es-ES",
  PL: "pl-PL"
};

const LANGUAGE_TRANSLATION_TARGET_MAP = {
  EN: "en",
  FR: "fr",
  NL: "nl",
  DE: "de",
  IT: "it",
  NO: "no",
  SV: "sv",
  DA: "da",
  FI: "fi",
  ES: "es",
  PL: "pl"
};

const DEFAULT_UI_LABELS = {
  qbrReport: "QBR Report",
  anyQuestions: "Any Questions?",
  thankYouSubtitleTemplate: "TD Affiliate Program - {period} Quarterly Business Review",
  currentPeriod: "Current Period",
  comparisonPeriodYoy: "Comparison Period (YoY)",
  basisYoy: "Basis: Year-over-Year (YoY)",
  publisherActivityBySegment: "Publisher Activity by Segment",
  keyObservations: "Key Observations",
  reportingPeriodPrefix: "Reporting Period",
  dataAsOfPrefix: "Data as of",
  comparisonPeriodPrefix: "Comparison Period",
  allFiguresStatement: "All figures are reported in {currency} unless otherwise stated. YoY variance is calculated as Current Period vs Comparison Period.",
  analysisTagSuffix: "Analysis",
  segmentSignalUnavailable: "Segment signal not available.",
  detailedMovementUnavailable: "Detailed movement not available from this extract.",
  kpiSignalGeneric: "KPI Signal",
  kpiDriverUnavailable: "Driver not confirmed from available KPI data.",
  kpiDetailUnavailable: "Detail not available from current extract.",
  kpiTitleConversionRateImprovement: "Conversion Rate Improvement",
  kpiTitleSalesVolumePressure: "Sales Volume Pressure",
  kpiTitleAovGrowthOffset: "AOV Growth Partially Offsetting Volume Decline",
  kpiTitleRisingCpa: "Rising CPA",
  kpiTitleRoiTrend: "ROI Trend"
};

const UI_LABELS_BY_LANGUAGE = {
  FR: {
    qbrReport: "Rapport QBR",
    anyQuestions: "Des questions ?",
    thankYouSubtitleTemplate: "Programme d'affiliation TD - {period} Revue trimestrielle",
    currentPeriod: "PÃ©riode actuelle",
    comparisonPeriodYoy: "PÃ©riode de comparaison (YoY)",
    basisYoy: "RÃ©fÃ©rence : glissement annuel (YoY)",
    publisherActivityBySegment: "ActivitÃ© des Ã©diteurs par segment",
    keyObservations: "Observations clÃ©s",
    reportingPeriodPrefix: "PÃ©riode de reporting",
    dataAsOfPrefix: "DonnÃ©es au",
    comparisonPeriodPrefix: "PÃ©riode de comparaison",
    allFiguresStatement: "Toutes les valeurs sont prÃ©sentÃ©es en {currency}, sauf indication contraire. La variation YoY est calculÃ©e entre la pÃ©riode actuelle et la pÃ©riode de comparaison.",
    analysisTagSuffix: "Analyse"
  },
  NL: {
    qbrReport: "QBR-rapport",
    anyQuestions: "Vragen?",
    thankYouSubtitleTemplate: "TD Affiliate Programma - {period} Kwartaalreview",
    currentPeriod: "Huidige periode",
    comparisonPeriodYoy: "Vergelijkingsperiode (YoY)",
    basisYoy: "Basis: jaar-op-jaar (YoY)",
    publisherActivityBySegment: "Publisheractiviteit per segment",
    keyObservations: "Belangrijkste observaties",
    reportingPeriodPrefix: "Rapportageperiode",
    dataAsOfPrefix: "Gegevens per",
    comparisonPeriodPrefix: "Vergelijkingsperiode",
    allFiguresStatement: "Alle cijfers worden gerapporteerd in {currency}, tenzij anders vermeld. De YoY-variantie wordt berekend als huidige periode versus vergelijkingsperiode.",
    analysisTagSuffix: "Analyse"
  },
  DE: {
    qbrReport: "QBR-Bericht",
    anyQuestions: "Fragen?",
    thankYouSubtitleTemplate: "TD Affiliate-Programm - {period} Quartalsbericht",
    currentPeriod: "Aktueller Zeitraum",
    comparisonPeriodYoy: "Vergleichszeitraum (YoY)",
    basisYoy: "Basis: Jahr-Ã¼ber-Jahr (YoY)",
    publisherActivityBySegment: "Publisher-AktivitÃ¤t nach Segment",
    keyObservations: "Wichtigste Erkenntnisse",
    reportingPeriodPrefix: "Berichtszeitraum",
    dataAsOfPrefix: "Datenstand",
    comparisonPeriodPrefix: "Vergleichszeitraum",
    allFiguresStatement: "Alle Werte werden in {currency} angegeben, sofern nicht anders vermerkt. Die YoY-Abweichung wird als aktueller Zeitraum gegenÃ¼ber Vergleichszeitraum berechnet.",
    analysisTagSuffix: "Analyse"
  },
  IT: {
    qbrReport: "Report QBR",
    anyQuestions: "Domande?",
    thankYouSubtitleTemplate: "Programma di affiliazione TD - {period} Revisione trimestrale",
    currentPeriod: "Periodo corrente",
    comparisonPeriodYoy: "Periodo di confronto (YoY)",
    basisYoy: "Base: anno su anno (YoY)",
    publisherActivityBySegment: "AttivitÃ  publisher per segmento",
    keyObservations: "Osservazioni chiave",
    reportingPeriodPrefix: "Periodo di reporting",
    dataAsOfPrefix: "Dati al",
    comparisonPeriodPrefix: "Periodo di confronto",
    allFiguresStatement: "Tutti i valori sono riportati in {currency}, salvo diversa indicazione. La variazione YoY Ã¨ calcolata come periodo corrente vs periodo di confronto.",
    analysisTagSuffix: "Analisi"
  },
  NO: {
    qbrReport: "QBR-rapport",
    anyQuestions: "SpÃ¸rsmÃ¥l?",
    thankYouSubtitleTemplate: "TD affiliateprogram - {period} kvartalsgjennomgang",
    currentPeriod: "Gjeldende periode",
    comparisonPeriodYoy: "Sammenligningsperiode (YoY)",
    basisYoy: "Grunnlag: Ã¥r-over-Ã¥r (YoY)",
    publisherActivityBySegment: "Publisheraktivitet etter segment",
    keyObservations: "NÃ¸kkelobservasjoner",
    reportingPeriodPrefix: "Rapporteringsperiode",
    dataAsOfPrefix: "Data per",
    comparisonPeriodPrefix: "Sammenligningsperiode",
    allFiguresStatement: "Alle tall er oppgitt i {currency}, med mindre annet er angitt. YoY-variansen er beregnet som gjeldende periode mot sammenligningsperioden.",
    analysisTagSuffix: "Analyse"
  },
  SV: {
    qbrReport: "QBR-rapport",
    anyQuestions: "NÃ¥gra frÃ¥gor?",
    thankYouSubtitleTemplate: "TD affiliateprogram - {period} kvartalsgenomgÃ¥ng",
    currentPeriod: "Aktuell period",
    comparisonPeriodYoy: "JÃ¤mfÃ¶relseperiod (YoY)",
    basisYoy: "Grund: Ã¥r Ã¶ver Ã¥r (YoY)",
    publisherActivityBySegment: "Publisheraktivitet per segment",
    keyObservations: "Viktiga observationer",
    reportingPeriodPrefix: "Rapporteringsperiod",
    dataAsOfPrefix: "Data per",
    comparisonPeriodPrefix: "JÃ¤mfÃ¶relseperiod",
    allFiguresStatement: "Alla siffror rapporteras i {currency} om inget annat anges. YoY-variansen berÃ¤knas som aktuell period jÃ¤mfÃ¶rt med jÃ¤mfÃ¶relseperiod.",
    analysisTagSuffix: "Analys"
  },
  DA: {
    qbrReport: "QBR-rapport",
    anyQuestions: "Nogen spÃ¸rgsmÃ¥l?",
    thankYouSubtitleTemplate: "TD affiliateprogram - {period} kvartalsgennemgang",
    currentPeriod: "Aktuel periode",
    comparisonPeriodYoy: "Sammenligningsperiode (YoY)",
    basisYoy: "Grundlag: Ã¥r-til-Ã¥r (YoY)",
    publisherActivityBySegment: "Publisheraktivitet efter segment",
    keyObservations: "NÃ¸gleobservationer",
    reportingPeriodPrefix: "Rapporteringsperiode",
    dataAsOfPrefix: "Data pr.",
    comparisonPeriodPrefix: "Sammenligningsperiode",
    allFiguresStatement: "Alle tal rapporteres i {currency}, medmindre andet er angivet. YoY-variansen beregnes som aktuel periode versus sammenligningsperiode.",
    analysisTagSuffix: "Analyse"
  },
  FI: {
    qbrReport: "QBR-raportti",
    anyQuestions: "KysymyksiÃ¤?",
    thankYouSubtitleTemplate: "TD-kumppanuusohjelma - {period} neljÃ¤nnesvuosikatsaus",
    currentPeriod: "Nykyinen jakso",
    comparisonPeriodYoy: "Vertailujakso (YoY)",
    basisYoy: "Perusta: vuosi vuodelta (YoY)",
    publisherActivityBySegment: "Julkaisija-aktiivisuus segmenteittÃ¤in",
    keyObservations: "Keskeiset havainnot",
    reportingPeriodPrefix: "Raportointijakso",
    dataAsOfPrefix: "Tiedot pÃ¤ivÃ¤ltÃ¤",
    comparisonPeriodPrefix: "Vertailujakso",
    allFiguresStatement: "Kaikki luvut raportoidaan valuutassa {currency}, ellei toisin mainita. YoY-vaihtelu lasketaan nykyisen jakson ja vertailujakson vÃ¤lillÃ¤.",
    analysisTagSuffix: "Analyysi"
  },
  ES: {
    qbrReport: "Informe QBR",
    anyQuestions: "Â¿Preguntas?",
    thankYouSubtitleTemplate: "Programa de afiliaciÃ³n TD - {period} RevisiÃ³n trimestral",
    currentPeriod: "PerÃ­odo actual",
    comparisonPeriodYoy: "PerÃ­odo de comparaciÃ³n (YoY)",
    basisYoy: "Base: interanual (YoY)",
    publisherActivityBySegment: "Actividad de publishers por segmento",
    keyObservations: "Observaciones clave",
    reportingPeriodPrefix: "PerÃ­odo del informe",
    dataAsOfPrefix: "Datos a fecha de",
    comparisonPeriodPrefix: "PerÃ­odo de comparaciÃ³n",
    allFiguresStatement: "Todas las cifras se presentan en {currency}, salvo que se indique lo contrario. La variaciÃ³n YoY se calcula como perÃ­odo actual frente a perÃ­odo de comparaciÃ³n.",
    analysisTagSuffix: "AnÃ¡lisis"
  },
  PL: {
    qbrReport: "Raport QBR",
    anyQuestions: "Pytania?",
    thankYouSubtitleTemplate: "Program partnerski TD - {period} PrzeglÄ…d kwartalny",
    currentPeriod: "BieÅ¼Ä…cy okres",
    comparisonPeriodYoy: "Okres porÃ³wnawczy (r/r)",
    basisYoy: "Podstawa: rok do roku (r/r)",
    publisherActivityBySegment: "AktywnoÅ›Ä‡ wydawcÃ³w wedÅ‚ug segmentu",
    keyObservations: "Kluczowe obserwacje",
    reportingPeriodPrefix: "Okres raportowania",
    dataAsOfPrefix: "Dane na dzieÅ„",
    comparisonPeriodPrefix: "Okres porÃ³wnawczy",
    allFiguresStatement: "Wszystkie wartoÅ›ci raportowane sÄ… w walucie {currency}, o ile nie wskazano inaczej. Zmiana r/r jest liczona jako bieÅ¼Ä…cy okres wzglÄ™dem okresu porÃ³wnawczego.",
    analysisTagSuffix: "Analiza",
    segmentSignalUnavailable: "SygnaÅ‚ segmentu jest niedostÄ™pny.",
    detailedMovementUnavailable: "SzczegÃ³Å‚owy opis zmian nie jest dostÄ™pny w tym wyciÄ…gu.",
    kpiSignalGeneric: "SygnaÅ‚ KPI",
    kpiDriverUnavailable: "Brak potwierdzonego czynnika na podstawie dostÄ™pnych danych KPI.",
    kpiDetailUnavailable: "SzczegÃ³Å‚y nie sÄ… dostÄ™pne w bieÅ¼Ä…cym wyciÄ…gu.",
    kpiTitleConversionRateImprovement: "Poprawa wspÃ³Å‚czynnika konwersji",
    kpiTitleSalesVolumePressure: "Presja na wolumen sprzedaÅ¼y",
    kpiTitleAovGrowthOffset: "Wzrost AOV czÄ™Å›ciowo kompensujÄ…cy spadek wolumenu",
    kpiTitleRisingCpa: "Wzrost CPA",
    kpiTitleRoiTrend: "Trend ROI"
  }
};

const TRANSLATE_TIMEOUT_MS = Math.max(700, Number(process.env.QBR_TRANSLATE_TIMEOUT_MS || 1500));
const TRANSLATE_CONCURRENCY = Math.max(1, Number(process.env.QBR_TRANSLATE_CONCURRENCY || 12));
const TRANSLATE_MAX_TEXTS = Math.max(200, Number(process.env.QBR_TRANSLATE_MAX_TEXTS || 1200));
const AUTO_TRANSLATE_ENABLED = !/^(0|false|off)$/i.test(String(process.env.QBR_AUTO_TRANSLATE || "true"));

function cleanText(value, fallback = "") {
  const raw = String(value ?? fallback);
  const repaired = TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), raw);
  const repairedCurrency = repaired
    .replace(/Ã‚Â£/g, "\u00A3")
    .replace(/Ã¢â€šÂ¬/g, "\u20AC")
    .replace(/zÃ…â€š/g, "z\u0142");
  const xmlSafe = repairedCurrency.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return xmlSafe.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanInlineText(value, fallback = "") {
  return cleanText(value, fallback).replace(/\s+/g, " ").trim();
}

function normalizeLanguageCode(value) {
  const code = cleanInlineText(value || "EN").toUpperCase();
  return LANGUAGE_TRANSLATION_TARGET_MAP[code] ? code : "EN";
}

function localeForLanguageCode(languageCode) {
  return LANGUAGE_LOCALE_MAP[normalizeLanguageCode(languageCode)] || "en-GB";
}

function uiLabelsForLanguage(languageCode) {
  const code = normalizeLanguageCode(languageCode);
  return {
    ...DEFAULT_UI_LABELS,
    ...(UI_LABELS_BY_LANGUAGE[code] || {})
  };
}

function uiLabel(deck, key, fallback) {
  const labels = deck?.metadata?.uiLabels || {};
  return cleanInlineText(labels[key] || fallback || "");
}

function shouldTranslateText(value) {
  const text = cleanInlineText(value || "");
  if (!text) return false;
  if (text.length < 2 || text.length > 2400) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^[\d\s.,:+\-\u2013\u2014/%()\u00A3\u20AC$z\u0142kr]+$/i.test(text)) return false;
  return /\p{L}/u.test(text);
}

function fetchJsonWithHttps(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "User-Agent": "qbr-pptx-service/1.0"
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Unexpected status ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Request timed out"));
    });
  });
}
async function translateWithGoogle(text, targetLang) {
  if (!AUTO_TRANSLATE_ENABLED) return text;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  const canUseFetch = typeof fetch === "function" && typeof AbortController === "function";
  const controller = canUseFetch ? new AbortController() : null;
  const timer = canUseFetch
    ? setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)
    : null;
  try {
    const data = canUseFetch
      ? await (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        return response.json();
      })()
      : await fetchJsonWithHttps(url, TRANSLATE_TIMEOUT_MS);
    if (!Array.isArray(data) || !Array.isArray(data[0])) return text;
    const translated = data[0]
      .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
      .join("")
      .trim();
    return translated || text;
  } catch (_) {
    return text;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function collectDeckTextRefs(deckSpec) {
  const refs = [];
  const addRef = (container, key, priority = 2) => {
    if (!container) return;
    const value = container[key];
    if (typeof value !== "string") return;
    if (!shouldTranslateText(value)) return;
    refs.push({ container, key, text: value, priority });
  };

  for (const slide of deckSpec.slides || []) {
    ["title", "subtitle", "headline", "summary", "callout", "footerNote"].forEach((key) => addRef(slide, key, 4));

    if (Array.isArray(slide.bullets)) {
      slide.bullets.forEach((_, idx) => addRef(slide.bullets, idx, 4));
    }

    if (Array.isArray(slide.signals)) {
      slide.signals.forEach((signal) => {
        addRef(signal, "title", 4);
        addRef(signal, "detail", 4);
      });
    }

    if (Array.isArray(slide.kpis)) {
      slide.kpis.forEach((kpi) => {
        addRef(kpi, "label", 4);
        addRef(kpi, "summary", 4);
      });
    }

    if (Array.isArray(slide.tables)) {
      slide.tables.forEach((table) => {
        addRef(table, "title", 3);
        if (Array.isArray(table.columns)) {
          table.columns.forEach((_, idx) => addRef(table.columns, idx, 3));
        }
        if (Array.isArray(table.rows)) {
          table.rows.forEach((row) => {
            if (!Array.isArray(row)) return;
            row.forEach((cell, idx) => {
              if (typeof cell !== "string") return;
              const trimmed = cleanInlineText(cell);
              if (!shouldTranslateText(trimmed)) return;
              refs.push({ container: row, key: idx, text: cell, priority: 2 });
            });
          });
        }
      });
    }
  }

  return refs;
}

async function localizeDeckSpec(deckSpec, languageCode) {
  const code = normalizeLanguageCode(languageCode);
  const locale = localeForLanguageCode(code);
  deckSpec.metadata.locale = locale;
  deckSpec.metadata.uiLabels = uiLabelsForLanguage(code);

  const targetLang = LANGUAGE_TRANSLATION_TARGET_MAP[code] || "en";
  if (targetLang === "en") return deckSpec;

  const refs = collectDeckTextRefs(deckSpec);
  if (!refs.length) return deckSpec;

  const cache = new Map();
  const rankedTexts = new Map();
  refs.forEach((ref) => {
    const key = cleanText(ref.text || "");
    if (!key) return;
    const existing = rankedTexts.get(key);
    const currentPriority = Number(ref.priority || 1);
    if (!existing || currentPriority > existing.priority) {
      rankedTexts.set(key, { text: key, priority: currentPriority });
    }
  });
  const uniqueTexts = Array.from(rankedTexts.values())
    .sort((a, b) => (b.priority - a.priority) || (b.text.length - a.text.length))
    .slice(0, TRANSLATE_MAX_TEXTS)
    .map((entry) => entry.text);
  const translatableTexts = [];
  for (const text of uniqueTexts) {
    if (!shouldTranslateText(text)) {
      cache.set(text, text);
    } else {
      translatableTexts.push(text);
    }
  }

  if (translatableTexts.length) {
    let nextIndex = 0;
    const workerCount = Math.min(TRANSLATE_CONCURRENCY, translatableTexts.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < translatableTexts.length) {
        const idx = nextIndex;
        nextIndex += 1;
        const text = translatableTexts[idx];
        const translated = await translateWithGoogle(text, targetLang);
        cache.set(text, cleanText(translated || text));
      }
    });
    await Promise.all(workers);
  }

  refs.forEach((ref) => {
    const key = cleanText(ref.text || "");
    const translated = cache.get(key);
    if (translated) ref.container[ref.key] = translated;
  });

  return deckSpec;
}

function normalizeHex(value, fallback) {
  const compact = String(value ?? "").trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(compact) ? `#${compact}` : fallback;
}

function normalizeTableKey(key) {
  const compact = cleanInlineText(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  return TABLE_KEY_MAP[compact] || compact || "table";
}

function titleFromKey(key) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = cleanInlineText(value);
  if (!text) return null;
  text = text.replace(/[\u00A3\u20AC$\u00A5]|z\u0142|kr/gi, "").replace(/\s+/g, "");
  const isPercent = text.endsWith("%");
  text = text.replace(/%/g, "").replace(/[()]/g, "");

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const decimals = text.length - lastComma - 1;
    text = decimals >= 1 && decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const decimals = text.length - lastDot - 1;
    if (!(decimals >= 1 && decimals <= 4)) text = text.replace(/\./g, "");
  }

  const numeric = Number(text.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return isPercent ? numeric : numeric;
}

function detectUnit(label, sample) {
  const key = cleanInlineText(label).toLowerCase();
  const value = cleanInlineText(sample);
  if (value.includes("%") || key.includes("rate") || key.includes("variance")) return "percent";
  if (/[\u00A3\u20AC$\u00A5]|z\u0142|kr/i.test(value) || key.includes("value") || key.includes("commission") || key.includes("cpa")) return "currency";
  if (key.includes("roi")) return "ratio";
  if (/^\d+([,.]\d+)?$/.test(value.replace(/[+-]/g, ""))) return "number";
  return "text";
}

function parseSections(text) {
  const normalized = cleanText(text);
  if (!normalized) return [];

  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let currentTitle = "Summary";
  let bullets = [];
  let paragraphs = [];

  function flush() {
    if (bullets.length === 0 && paragraphs.length === 0 && sections.length > 0) return;
    sections.push({ title: currentTitle, bullets, paragraphs });
    bullets = [];
    paragraphs = [];
  }

  for (const line of lines) {
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    if (heading) {
      if (bullets.length > 0 || paragraphs.length > 0 || sections.length === 0) flush();
      currentTitle = cleanInlineText(heading[1], "Summary");
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(cleanInlineText(line.replace(/^[-*]\s+/, "")));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      bullets.push(cleanInlineText(line.replace(/^\d+\.\s+/, "")));
      continue;
    }
    paragraphs.push(cleanInlineText(line));
  }

  if (bullets.length > 0 || paragraphs.length > 0 || sections.length === 0) flush();
  return sections.filter((section) => section.bullets.length || section.paragraphs.length);
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[cleanInlineText(key, "Value")] = cleanInlineText(value, "-") || "-";
      }
      return normalized;
    });
}

function normalizeTables(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const tables = {};
  for (const [rawKey, rawRows] of Object.entries(input)) {
    const key = normalizeTableKey(rawKey);
    const rows = normalizeRows(rawRows);
    if (!rows.length) continue;
    tables[key] = {
      key,
      title: titleFromKey(key),
      columns: Object.keys(rows[0] || {}),
      rows
    };
  }
  return tables;
}

function normalizeProgramScopeTable(input) {
  const rowsInput = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray(input.rows)
      ? input.rows
      : [];

  const rows = normalizeRows(rowsInput);
  if (!rows.length) return null;

  const findValue = (row, aliases) => {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
      const matchedKey = Object.keys(row).find((key) => key.toLowerCase() === alias.toLowerCase());
      if (matchedKey) return row[matchedKey];
    }
    return "-";
  };

  const normalizedRows = rows
    .map((row) => PROGRAM_BREAKDOWN_COLUMNS.map((column) => findValue(row, column.aliases)))
    .filter((row) => row.some((value) => value && value !== "-"));

  if (!normalizedRows.length) return null;

  return {
    title: cleanInlineText((input && input.title) || "Program-Level Breakdown"),
    columns: PROGRAM_BREAKDOWN_COLUMNS.map((column) => column.label),
    rows: normalizedRows
  };
}

function normalizeMetrics(programYoYTable) {
  const rows = normalizeRows(programYoYTable);
  if (!rows.length) return { metrics: [], metricMap: {} };
  const recent = rows.find((row) => String(row.Row || "").toLowerCase().includes("recent")) || rows[0];
  const previous = rows.find((row) => String(row.Row || "").toLowerCase().includes("previous")) || rows[1];
  const difference = rows.find((row) => String(row.Row || "").toLowerCase().includes("difference")) || rows[2];
  const variance = rows.find((row) => String(row.Row || "").toLowerCase().includes("variance")) || rows[3];

  const columns = Object.keys(recent || {}).filter((column) => !["row", "metric"].includes(column.toLowerCase()));
  const metrics = columns.map((column) => {
    const current = recent ? recent[column] : undefined;
    const previousValue = previous ? previous[column] : undefined;
    const diff = difference ? difference[column] : undefined;
    const varianceValue = variance ? variance[column] : undefined;
    return {
      key: column.replace(/\s+/g, "").toLowerCase(),
      label: column,
      current,
      previous: previousValue,
      difference: diff,
      variance: varianceValue,
      currentValue: parseNumber(current),
      previousValue: parseNumber(previousValue),
      differenceValue: parseNumber(diff),
      varianceValue: parseNumber(varianceValue),
      unit: detectUnit(column, current || diff || varianceValue || previousValue || "")
    };
  });

  return {
    metrics,
    metricMap: Object.fromEntries(metrics.map((metric) => [metric.key, metric]))
  };
}

function normalizeRecommendations(recommendations) {
  if (!Array.isArray(recommendations)) return [];
  return recommendations
    .map((item) => {
      if (typeof item === "string") return cleanInlineText(item);
      if (item && typeof item === "object") return cleanInlineText(item.text || item.title || item.body || "");
      return "";
    })
    .filter(Boolean);
}

function normalizeSignalItems(signals) {
  if (!Array.isArray(signals)) return [];
  return signals
    .map((item) => {
      if (typeof item === "string") {
        const text = cleanInlineText(item);
        if (!text) return null;
        const split = text.split(/\s*:\s*/);
        if (split.length >= 2) {
          return { title: cleanInlineText(split.shift()), detail: cleanInlineText(split.join(": ")) };
        }
        return { title: text, detail: "" };
      }
      if (!item || typeof item !== "object") return null;
      const title = cleanInlineText(item.title || item.heading || item.label || "");
      const detail = cleanInlineText(item.detail || item.body || item.text || "");
      if (!title && !detail) return null;
      return { title: title || detail, detail: detail && detail !== title ? detail : "" };
    })
    .filter(Boolean);
}

function normalizeIdList(input) {
  if (Array.isArray(input)) {
    return input.map((item) => cleanInlineText(item)).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => cleanInlineText(item))
      .filter(Boolean);
  }
  return [];
}

function normalizeStringList(input) {
  if (Array.isArray(input)) {
    return input.map((item) => cleanInlineText(item)).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\r?\n|[;]+/)
      .map((item) => cleanInlineText(item))
      .filter(Boolean);
  }
  return [];
}

function normalizePositiveInt(input, fallback = 0) {
  const raw = Number(input);
  if (!Number.isFinite(raw)) return fallback;
  const value = Math.floor(raw);
  return value > 0 ? value : fallback;
}

function normalizeSlideBlueprint(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const key = cleanInlineText(item.key || item.id || item.kind || "");
      const title = cleanInlineText(item.title || "");
      if (!key && !title) return null;
      const slideNo = normalizePositiveInt(item.slide, index + 1);
      return { slide: slideNo, key, title };
    })
    .filter(Boolean)
    .sort((a, b) => a.slide - b.slide);
}

function normalizeSlideTableBindings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = cleanInlineText(rawKey).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) continue;

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const normalized = values
      .flatMap((value) => String(value || "").split(/[+,|]/))
      .map((value) => normalizeTableKey(value))
      .filter(Boolean);

    if (!normalized.length) continue;
    out[key] = Array.from(new Set(normalized));
  }
  return out;
}

function resolveTheme(themeName, overrides) {
  const colors = (overrides && overrides.colors) || {};
  const fonts = (overrides && overrides.fonts) || {};

  return {
    ...DEFAULT_THEME,
    name: cleanInlineText((overrides && overrides.themeName) || themeName || DEFAULT_THEME.name),
    companyName: cleanInlineText((overrides && overrides.companyName) || DEFAULT_THEME.companyName),
    logoText: cleanInlineText((overrides && overrides.logoText) || (overrides && overrides.companyName) || DEFAULT_THEME.logoText),
    fonts: {
      heading: cleanInlineText(fonts.heading || DEFAULT_THEME.fonts.heading),
      body: cleanInlineText(fonts.body || DEFAULT_THEME.fonts.body),
      mono: cleanInlineText(fonts.mono || DEFAULT_THEME.fonts.mono)
    },
    colors: {
      ink: normalizeHex(colors.ink, DEFAULT_THEME.colors.ink),
      paper: normalizeHex(colors.paper, DEFAULT_THEME.colors.paper),
      canvas: normalizeHex(colors.canvas, DEFAULT_THEME.colors.canvas),
      accent: normalizeHex(colors.accent, DEFAULT_THEME.colors.accent),
      accentAlt: normalizeHex(colors.accentAlt, DEFAULT_THEME.colors.accentAlt),
      success: normalizeHex(colors.success, DEFAULT_THEME.colors.success),
      warning: normalizeHex(colors.warning, DEFAULT_THEME.colors.warning),
      highlight: normalizeHex(colors.highlight, DEFAULT_THEME.colors.highlight),
      muted: normalizeHex(colors.muted, DEFAULT_THEME.colors.muted),
      border: normalizeHex(colors.border, DEFAULT_THEME.colors.border)
    }
  };
}

function normalizePayload(payload) {
  const nestedPayload = payload && typeof payload.payload === "object" && payload.payload
    ? payload.payload
    : {};
  const analysisLevel = cleanInlineText(payload.analysisLevel || nestedPayload.analysisLevel || "");
  const targetSlides = normalizePositiveInt(
    payload.targetSlides
    ?? payload.n_slides
    ?? payload.target_slides
    ?? nestedPayload.targetSlides
    ?? nestedPayload.n_slides
    ?? nestedPayload.target_slides,
    0
  );
  const normalizedSlideBlueprint = normalizeSlideBlueprint(payload.slideBlueprint || nestedPayload.slideBlueprint);
  const slideBlueprint = targetSlides > 0
    ? normalizedSlideBlueprint.slice(0, targetSlides)
    : normalizedSlideBlueprint;
  const slideTableBindings = normalizeSlideTableBindings(payload.slideTableBindings || nestedPayload.slideTableBindings || {});
  const client = cleanInlineText(payload.client || payload.clientName || "Client");
  const deckTitle = cleanInlineText(payload.deckTitle || `QBR - ${client}`);
  const reportingPeriod = cleanInlineText(payload.reportingPeriod || "Reporting period not provided");
  const comparisonPeriod = cleanInlineText(payload.comparisonPeriod || "Comparison period not provided");
  const qbrFocus = cleanInlineText(payload.qbrFocus || "General performance review");
  const qbrFocusDetail = cleanInlineText(payload.qbrFocusDetail || "");
  const languageCode = normalizeLanguageCode(payload.languageCode || "EN");
  const languageName = cleanInlineText(payload.languageName || "English");
  const locale = localeForLanguageCode(languageCode);
  const currencyCode = cleanInlineText(payload.currencyCode || "EUR").toUpperCase();
  const programOutput = cleanText(payload.programOutput || "");
  const publisherAnalysis = cleanText(payload.publisherAnalysis || "");
  const executiveSummaryText = cleanInlineText(
    payload.executiveSummaryText || payload.programExecutiveSummaryText || ""
  );
  const publisherOverviewObservations = normalizeStringList(
    payload.publisherOverviewObservations || payload.publisherKeyObservations || payload.keyObservations
  );
  const salesGrowthSignals = normalizeSignalItems(
    payload.salesGrowthSignals || payload.salesGrowthSignalBullets || payload.salesGrowthAnalysis
  );
  const rawProgramScopeTable = payload.programScopeTable || nestedPayload.programScopeTable || payload.programLevelBreakdown || payload.programBreakdownTable;
  const scopeRowsForIds = Array.isArray(rawProgramScopeTable)
    ? rawProgramScopeTable
    : rawProgramScopeTable && typeof rawProgramScopeTable === "object" && Array.isArray(rawProgramScopeTable.rows)
      ? rawProgramScopeTable.rows
      : [];
  const scopeDerivedProgramIds = Array.from(new Set(
    scopeRowsForIds
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return "";
        const key = Object.keys(row).find((candidate) => {
          const k = cleanInlineText(candidate).toLowerCase().replace(/\s+/g, "");
          return k === "programid" || k === "id";
        });
        return key ? cleanInlineText(row[key]) : "";
      })
      .filter(Boolean)
  ));

  const explicitAnalysisProgramIds = Array.from(new Set([
    ...normalizeIdList(payload.analysisProgramIds),
    ...normalizeIdList(payload.publisherProgramIds),
    ...normalizeIdList(payload.programIds),
    ...normalizeIdList(nestedPayload.analysisProgramIds),
    ...normalizeIdList(nestedPayload.publisherProgramIds),
    ...normalizeIdList(nestedPayload.programIds)
  ].filter(Boolean)));

  const fallbackProgramIds = Array.from(new Set([
    cleanInlineText(payload.programId || nestedPayload.programId || ""),
    cleanInlineText(payload.publisherProgramId || nestedPayload.publisherProgramId || "")
  ].filter(Boolean)));

  const analysisProgramIds = explicitAnalysisProgramIds.length
    ? Array.from(new Set([...explicitAnalysisProgramIds, ...scopeDerivedProgramIds]))
    : (scopeDerivedProgramIds.length ? scopeDerivedProgramIds : fallbackProgramIds);
  const tables = normalizeTables(payload.publisherTables || nestedPayload.publisherTables || {});
  const { metrics, metricMap } = normalizeMetrics(payload.programYoYTable || []);
  const programScopeTable = (
    Array.isArray(rawProgramScopeTable)
    || (rawProgramScopeTable && typeof rawProgramScopeTable === "object" && Array.isArray(rawProgramScopeTable.rows))
  )
    ? rawProgramScopeTable
    : normalizeProgramScopeTable(rawProgramScopeTable);

  return {
    requestId: cleanInlineText(payload.requestId || `qbr-${Date.now()}`),
    client,
    deckTitle,
    themeName: cleanInlineText(payload.themeName || "TD"),
    themeOverrides: payload.themeOverrides,
    reportingPeriod,
    comparisonPeriod,
    qbrFocus,
    qbrFocusDetail,
    analysisLevel,
    targetSlides,
    slideBlueprint,
    slideTableBindings,
    languageCode,
    languageName,
    locale,
    currencyCode,
    fullContent: payload.fullContent !== false,
    includeAppendix: payload.includeAppendix === true,
    debug: payload.debug === true,
    outputFileName: cleanInlineText(payload.outputFileName || ""),
    recommendations: normalizeRecommendations(payload.recommendations),
    programSections: parseSections(programOutput),
    publisherSections: parseSections(publisherAnalysis),
    executiveSummaryText,
    publisherOverviewObservations,
    salesGrowthSignals,
    analysisProgramIds,
    programOutput,
    publisherAnalysis,
    metrics,
    metricMap,
    tables,
    programScopeTable
  };
}

function trend(metric) {
  if (!metric || metric.varianceValue === null || metric.varianceValue === undefined) return "na";
  if (metric.varianceValue > 0.2) return "up";
  if (metric.varianceValue < -0.2) return "down";
  return "flat";
}

function metricCard(metric) {
  if (!metric || !metric.current) return null;
  const comparison = metric.previous
    ? `${metric.current} vs ${metric.previous} PY`
    : `${metric.current}`;
  const summary = metric.variance ? `${comparison} - ${metric.variance}` : comparison;
  return {
    label: metric.label,
    value: metric.current,
    previous: metric.previous || "",
    summary,
    delta: metric.variance,
    trend: trend(metric)
  };
}

function getCurrencySymbol(code) {
  const c = cleanInlineText(code || "").toUpperCase();
  if (c === "GBP") return "\u00A3";
  if (c === "EUR") return "\u20AC";
  if (c === "USD") return "$";
  if (c === "AUD") return "A$";
  if (c === "PLN") return "z\u0142";
  if (["SEK", "NOK", "DKK", "ISK"].includes(c)) return "kr";
  return "";
}

function formatSignedMoney(value, currencyCode, locale = "en-GB") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  const symbol = getCurrencySymbol(currencyCode);
  const n = Number(value);
  const abs = Math.abs(n);
  const rounded = abs >= 1000 ? Math.round(abs) : Number(abs.toFixed(0));
  const txt = Number(rounded).toLocaleString(locale || "en-GB");
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${symbol}${txt}`;
}

function defaultBullets(input) {
  const bullets = input.programSections.flatMap((section) => section.bullets);
  if (bullets.length) return bullets.slice(0, 5);
  return input.publisherSections.flatMap((section) => section.bullets).slice(0, 5);
}

function buildHeadline(input) {
  const clicks = input.metricMap.clicks;
  const sales = input.metricMap.sales;
  const conversion = input.metricMap.convrate;
  const orderValue = input.metricMap.ordervalue;
  const aov = input.metricMap.aov;

  if ((conversion && conversion.varianceValue > 0) && (clicks && clicks.varianceValue < 0)) return "Conversion improved despite softer traffic";
  if ((sales && sales.varianceValue > 0) && (orderValue && orderValue.varianceValue > 0)) return "Sales and order value both improved year on year";
  if ((sales && sales.varianceValue < 0) && (aov && aov.varianceValue > 0)) return "Higher basket value only partly offset softer sales";
  if ((orderValue && orderValue.varianceValue < 0) && (conversion && conversion.varianceValue > 0)) return "Efficiency improved, but value generation remained under pressure";
  if (input.qbrFocus) return `${input.qbrFocus} remains the primary QBR focus`;
  return "Performance was mixed across volume and value measures";
}

function parsePeriodRange(reportingPeriod, locale = "en-GB") {
  const text = cleanInlineText(reportingPeriod || "");
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|\u2013|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) return text || "the current period";

  const start = new Date(`${match[1]}T00:00:00Z`);
  const end = new Date(`${match[2]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return text || "the current period";

  const options = { month: "short", year: "numeric", timeZone: "UTC" };
  const startLabel = start.toLocaleString(locale, options);
  const endLabel = end.toLocaleString(locale, options);
  return `${startLabel} \u2013 ${endLabel}`;
}

function parseIsoPeriod(periodText) {
  const text = cleanInlineText(periodText || "");
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|\u2013|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) return null;

  const start = new Date(`${match[1]}T00:00:00Z`);
  const end = new Date(`${match[2]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end, startRaw: match[1], endRaw: match[2] };
}

function formatLongDate(date, locale = "en-GB") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatCompactDate(date, locale = "en-GB") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC"
  }).replace(/\//g, "");
}

function formatPeriodForSlide(periodText, locale = "en-GB") {
  const parsed = parseIsoPeriod(periodText);
  if (!parsed) return cleanInlineText(periodText || "Not specified");
  return `${formatLongDate(parsed.start, locale)} \u2013 ${formatLongDate(parsed.end, locale)}`;
}

function buildCoverPeriodTag(periodText, locale = "en-GB") {
  const parsed = parseIsoPeriod(periodText);
  if (!parsed) return "PERIOD";
  return `${formatCompactDate(parsed.start, locale)}-${formatCompactDate(parsed.end, locale)}`;
}

function movementVerb(metric, positive = "increased", negative = "decreased") {
  if (!metric || metric.varianceValue === null || metric.varianceValue === undefined || Number.isNaN(Number(metric.varianceValue))) {
    return "changed";
  }
  if (Number(metric.varianceValue) > 0) return positive;
  if (Number(metric.varianceValue) < 0) return negative;
  return "was flat";
}

function buildExecutiveSummaryText(input) {
  const selectedProgramIds = Array.isArray(input.analysisProgramIds)
    ? input.analysisProgramIds.map((value) => cleanInlineText(value)).filter(Boolean)
    : [];
  const selectedProgramCount = new Set(selectedProgramIds).size;
  const isMultiProgramScope = selectedProgramCount > 1;

  const providedSummary = cleanInlineText(input.executiveSummaryText || "");
  if (providedSummary) {
    const providedLooksMultiProgram = /selected programs?|all programs?|combined|portfolio|across\s+\d+\s+programs?/i.test(providedSummary);
    if (!isMultiProgramScope || providedLooksMultiProgram) return providedSummary;
  }

  const m = input.metricMap || {};
  const sales = m.sales || {};
  const clicks = m.clicks || {};
  const conv = m.convrate || {};
  const aov = m.aov || {};
  const ov = m.ordervalue || {};

  const programLabel = cleanInlineText(input.client || "Program");
  const periodLabel = parsePeriodRange(input.reportingPeriod, input.locale);
  const openingLine = isMultiProgramScope
    ? `Across ${selectedProgramCount} selected programs, performance was mixed in ${periodLabel}.`
    : (() => {
        const affiliateLabel = /affiliate program/i.test(programLabel)
          ? programLabel
          : `${programLabel} Affiliate Program`;
        return `The ${affiliateLabel} delivered mixed results in ${periodLabel}.`;
      })();

  return cleanInlineText(
    `${openingLine} While AOV grew ${aov.variance || "N/A"} to ${aov.current || "-"} and conversion rate improved ${conv.variance || "N/A"}, total sales declined ${sales.variance || "N/A"} YoY driven by a ${clicks.variance || "N/A"} reduction in click volume. Total order value ${movementVerb(ov)} ${ov.variance || "N/A"} to ${ov.current || "-"}. Full KPI breakdown follows on the next slides.`
  );
}

function buildMetricRows(metricMap, keys) {
  return keys
    .map(([key, label]) => {
      const metric = metricMap[key];
      if (!metric) return null;
      return [
        label,
        metric.current || "-",
        metric.previous || "-",
        metric.difference || "-",
        metric.variance || "-"
      ];
    })
    .filter(Boolean);
}

function buildProgramBreakdownTable(input) {
  const targetColumns = [
    "Program ID",
    "Market",
    "Clicks",
    "Impressions",
    "Sales",
    "Conversion Rate",
    "AOV",
    "Total Order Value",
    "YoY Change"
  ];
  const selectedProgramIds = new Set(
    (Array.isArray(input.analysisProgramIds) ? input.analysisProgramIds : [])
      .map((value) => cleanInlineText(value))
      .filter(Boolean)
  );
  const canonicalizeProgramId = (value) => {
    const raw = cleanInlineText(value);
    if (!raw || raw === "-") return "";
    if (/^\d+$/.test(raw)) return String(Number(raw));
    return raw.toLowerCase();
  };
  const selectedProgramIdsCanonical = new Set(
    Array.from(selectedProgramIds).map((value) => canonicalizeProgramId(value)).filter(Boolean)
  );
  const selectedProgramIdSingle = selectedProgramIds.size === 1 ? Array.from(selectedProgramIds)[0] : "";

  function isSelectedProgramId(programIdValue) {
    if (!selectedProgramIds.size) return true;
    const candidate = cleanInlineText(programIdValue);
    if (!candidate || candidate === "-") return false;
    if (selectedProgramIds.has(candidate)) return true;
    const canonical = canonicalizeProgramId(candidate);
    return canonical ? selectedProgramIdsCanonical.has(canonical) : false;
  }

  function rowHasMetrics(row) {
    const cells = Array.isArray(row) ? row.slice(1) : [];
    return cells.some((cell) => {
      const value = cleanInlineText(cell);
      return value && value !== "-";
    });
  }

  function firstObjectValue(obj, aliases) {
    if (!obj || typeof obj !== "object") return "-";
    const directKeys = Object.keys(obj);
    const byLower = Object.fromEntries(directKeys.map((k) => [k.toLowerCase(), k]));
    for (const alias of aliases) {
      const key = byLower[String(alias).toLowerCase()];
      if (!key) continue;
      const value = obj[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "-";
  }

  function firstRowCell(row, idx, aliases) {
    for (const alias of aliases) {
      const key = String(alias).toLowerCase();
      const colIndex = idx[key];
      if (colIndex === undefined) continue;
      const value = row[colIndex];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "-";
  }

  const scope = input.programScopeTable;
  if (Array.isArray(scope) && scope.length && typeof scope[0] === "object" && !Array.isArray(scope[0])) {
    const mappedRows = scope
      .map((row) => {
        let programId = firstObjectValue(row, ["Program ID", "ProgramId", "ProgramID", "ID"]);
        if ((!programId || cleanInlineText(programId) === "-") && selectedProgramIdSingle) {
          programId = selectedProgramIdSingle;
        }
        const market = firstObjectValue(row, ["Market", "Country", "Region"]);
        const clicks = firstObjectValue(row, ["Clicks", "Current Clicks"]);
        const impressions = firstObjectValue(row, ["Impressions"]);
        const sales = firstObjectValue(row, ["Sales", "Current Sales"]);
        const convRate = firstObjectValue(row, ["Conversion Rate", "Conv Rate"]);
        const aov = firstObjectValue(row, ["AOV"]);
        const totalOv = firstObjectValue(row, ["Total Order Value", "Current OV", "Order Value"]);
        const yoy = firstObjectValue(row, ["YoY Change", "OV YoY %", "Sales YoY %"]);
        return [programId, market, clicks, impressions, sales, convRate, aov, totalOv, yoy];
      });
    const rows = mappedRows.filter((row) => isSelectedProgramId(row[0]));
    const fallbackRows = mappedRows.filter((row) => rowHasMetrics(row));

    if (!rows.length && selectedProgramIds.size && fallbackRows.length) {
      return {
        title: "Program-Level Breakdown",
        columns: targetColumns,
        rows: fallbackRows,
        dense: false
      };
    }

    if (!rows.length && selectedProgramIds.size) {
      return {
        title: "Program-Level Breakdown",
        columns: targetColumns,
        rows: Array.from(selectedProgramIds).map((id) => [id, "-", "-", "-", "-", "-", "-", "-", "-"]),
        dense: false
      };
    }

    return {
      title: "Program-Level Breakdown",
      columns: targetColumns,
      rows,
      dense: false
    };
  }

  if (scope && Array.isArray(scope.rows) && scope.rows.length) {
    const idx = Object.fromEntries((scope.columns || []).map((col, i) => [cleanInlineText(col).toLowerCase(), i]));
    const mappedRows = scope.rows
      .map((row) => {
        let programId = firstRowCell(row, idx, ["program id", "programid", "id"]);
        if ((!programId || cleanInlineText(programId) === "-") && selectedProgramIdSingle) {
          programId = selectedProgramIdSingle;
        }
        const market = firstRowCell(row, idx, ["market", "country", "region"]);
        const clicks = firstRowCell(row, idx, ["clicks", "current clicks"]);
        const impressions = firstRowCell(row, idx, ["impressions"]);
        const sales = firstRowCell(row, idx, ["sales", "current sales"]);
        const convRate = firstRowCell(row, idx, ["conversion rate", "conv rate"]);
        const aov = firstRowCell(row, idx, ["aov"]);
        const totalOv = firstRowCell(row, idx, ["total order value", "current ov", "order value"]);
        const yoy = firstRowCell(row, idx, ["yoy change", "ov yoy %", "sales yoy %"]);
        return [programId, market, clicks, impressions, sales, convRate, aov, totalOv, yoy];
      });
    const rows = mappedRows.filter((row) => isSelectedProgramId(row[0]));
    const fallbackRows = mappedRows.filter((row) => rowHasMetrics(row));

    if (!rows.length && selectedProgramIds.size && fallbackRows.length) {
      return {
        title: "Program-Level Breakdown",
        columns: targetColumns,
        rows: fallbackRows,
        dense: false
      };
    }

    if (!rows.length && selectedProgramIds.size) {
      return {
        title: "Program-Level Breakdown",
        columns: targetColumns,
        rows: Array.from(selectedProgramIds).map((id) => [id, "-", "-", "-", "-", "-", "-", "-", "-"]),
        dense: false
      };
    }

    return {
      title: "Program-Level Breakdown",
      columns: targetColumns,
      rows,
      dense: false
    };
  }

  if (Array.isArray(input.analysisProgramIds) && input.analysisProgramIds.length) {
    return {
      title: "Program-Level Breakdown",
      columns: targetColumns,
      rows: input.analysisProgramIds.map((id) => [id, "-", "-", "-", "-", "-", "-", "-", "-"]),
      dense: false
    };
  }

  return {
    title: "Program-Level Breakdown",
    columns: targetColumns,
    rows: [["-", "-", "-", "-", "-", "-", "-", "-", "-"]],
    dense: false
  };
}

function tableRows(table, limit = 5) {
  if (!table || !table.rows || !table.rows.length) return null;
  const columns = Array.isArray(table.columns) ? [...table.columns] : [];
  const rows = table.rows.slice(0, limit).map((row) => columns.map((column) => row[column] || "-"));
  return { columns, rows };
}

function tableRowsWithRank(table, limit = 5) {
  const base = tableRows(table, limit);
  if (!base) return null;
  const ranked = base.columns[0] && base.columns[0].toLowerCase() === "rank";
  if (ranked) return base;

  return {
    columns: ["Rank", ...base.columns],
    rows: base.rows.map((row, index) => [String(index + 1), ...row])
  };
}

function tableOrPlaceholder(table, title, columns, placeholderRows = 5) {
  const ranked = tableRowsWithRank(table, placeholderRows);
  if (ranked && ranked.rows.length) {
    return {
      title,
      columns: ranked.columns,
      rows: ranked.rows
    };
  }

  const row = columns.map((column) => (column.toLowerCase() === "rank" ? "1" : "-"));
  return {
    title,
    columns,
    rows: [row]
  };
}

function tableOrPlaceholderNoRank(table, title, columns, placeholderRows = 5) {
  const base = tableRows(table, placeholderRows);
  if (base && base.rows.length) {
    return {
      title,
      columns: base.columns,
      rows: base.rows
    };
  }

  return {
    title,
    columns,
    rows: [columns.map(() => "-")]
  };
}

function extractVarianceToneMap(table) {
  const base = tableRows(table, 24);
  if (!base || !base.rows.length) return {};
  const findCol = (aliases) =>
    base.columns.findIndex((column) => aliases.includes(cleanInlineText(column).toLowerCase()));
  const idxMetric = findCol(["metric", "kpi"]);
  const idxTone = findCol(["tone", "direction", "signal"]);
  if (idxMetric < 0 || idxTone < 0) return {};
  const out = {};
  base.rows.forEach((row) => {
    const metric = cleanInlineText(row[idxMetric] || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const tone = cleanInlineText(row[idxTone] || "").toLowerCase();
    if (!metric || !tone) return;
    out[metric] = tone;
  });
  return out;
}

function sortProgramLevelAnalysisTable(table) {
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return table;
  const rows = table.rows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .slice();
  if (!rows.length) return table;

  const read = (row, aliases) => {
    for (const alias of aliases) {
      const direct = row[alias];
      if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
      const matchedKey = Object.keys(row).find((key) => cleanInlineText(key).toLowerCase() === String(alias).toLowerCase());
      if (matchedKey) return row[matchedKey];
    }
    return "-";
  };

  rows.sort((a, b) => {
    const aCommission = parseNumber(read(a, ["Commission", "Publisher Commission", "Current Commission"]));
    const bCommission = parseNumber(read(b, ["Commission", "Publisher Commission", "Current Commission"]));
    const aOrderValue = parseNumber(read(a, ["Order Value", "Current OV", "Total Order Value"]));
    const bOrderValue = parseNumber(read(b, ["Order Value", "Current OV", "Total Order Value"]));
    const aSales = parseNumber(read(a, ["Sales", "Current Sales"]));
    const bSales = parseNumber(read(b, ["Sales", "Current Sales"]));
    const aClicks = parseNumber(read(a, ["Clicks", "Current Clicks"]));
    const bClicks = parseNumber(read(b, ["Clicks", "Current Clicks"]));
    const aLowSignal = aCommission <= 0 && aOrderValue <= 0 && aSales <= 0;
    const bLowSignal = bCommission <= 0 && bOrderValue <= 0 && bSales <= 0;

    if (aLowSignal !== bLowSignal) return aLowSignal ? 1 : -1;
    if (aCommission !== bCommission) return bCommission - aCommission;
    if (aOrderValue !== bOrderValue) return bOrderValue - aOrderValue;
    if (aSales !== bSales) return bSales - aSales;
    if (aClicks !== bClicks) return bClicks - aClicks;

    const aName = cleanInlineText(read(a, ["Program Name", "Program", "Name"]));
    const bName = cleanInlineText(read(b, ["Program Name", "Program", "Name"]));
    return aName.localeCompare(bName);
  });

  return {
    ...table,
    rows
  };
}

function buildPublisherOverviewBullets(input) {
  const tidyObservationLine = (line) => {
    let text = cleanInlineText(line || "");
    text = text.replace(/^key observations?\s*[:\-]\s*/i, "");
    text = text
      .replace(/\s*-\s*I\s+recorded\b/gi, " recorded")
      .replace(/\s*-\s*I\s+drove\b/gi, " drove")
      .replace(/\s*-\s*I\s+account(?:s)?\s+for\b/gi, " accounts for")
      .replace(/\s+/g, " ")
      .trim();
    if (text && !/[.!?]$/.test(text)) text = `${text}.`;
    return text;
  };

  const cleanPublisherName = (value) =>
    cleanInlineText(value || "")
      .replace(/\s*-\s*I$/i, "")
      .replace(/\s+/g, " ")
      .trim();

  const isNarrativeCandidate = (line) => {
    const text = tidyObservationLine(line);
    if (!text || text.length < 30 || text.length > 260) return false;
    if (/\bsite\s*id\b/i.test(text)) return false;
    if (/\bcurrent sales:\b|\bcurrent ov:\b|\bov yoy change:\b|\bsales yoy %:\b/i.test(text)) return false;
    if (/^(voucher|cashback|other|content|css)\s*[-â€”]/i.test(text)) return false;
    if (/\btotal sales:\b|\btotal ov:\b|\bpublishers:\b/i.test(text)) return false;
    if (/^\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i.test(text)) return false;
    if (/\|\s/.test(text)) return false;
    return true;
  };

  const pickNarrativeBullets = (lines, limit = 4) => {
    const seen = new Set();
    const out = [];
    for (const line of lines || []) {
      const text = tidyObservationLine(line);
      if (!isNarrativeCandidate(text)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length >= limit) break;
    }
    return out;
  };

  if (input.publisherOverviewObservations && input.publisherOverviewObservations.length) {
    const curated = pickNarrativeBullets(input.publisherOverviewObservations, 4);
    if (curated.length) return curated;
  }

  const keyObservationSection = (input.publisherSections || []).find((section) =>
    /key observations?|publisher performance overview/i.test(cleanInlineText(section.title).toLowerCase())
  );
  const sectionBullets = pickNarrativeBullets(
    [
      ...(keyObservationSection?.bullets || []),
      ...(keyObservationSection?.paragraphs || [])
    ],
    4
  );
  if (sectionBullets.length) return sectionBullets;

  const growth = input.tables.topGrowthPublishers;
  const decline = input.tables.topDecliningPublishers;
  const current = input.tables.topCurrentPerformers;
  const brandNew = input.tables.brandNewPublishers;
  const segment = input.tables.segmentSnapshot;

  const obs = [];
  const topGrowthRow = growth?.rows?.[0];
  if (topGrowthRow) {
    const pub = cleanPublisherName(topGrowthRow.Publisher || "Top growth publisher");
    const seg = cleanInlineText(topGrowthRow.Segment || "N/A");
    const ovDelta = cleanInlineText(topGrowthRow["OV YoY Change"] || "N/A");
    const ovPct = cleanInlineText(topGrowthRow["OV YoY %"] || "N/A");
    obs.push(`${pub} drove the strongest YoY uplift (${seg}), adding ${ovDelta} in OV (${ovPct}).`);
  }

  const topDeclineRow = decline?.rows?.[0];
  if (topDeclineRow) {
    const pub = cleanPublisherName(topDeclineRow.Publisher || "Top declining publisher");
    const seg = cleanInlineText(topDeclineRow.Segment || "N/A");
    const ovDelta = cleanInlineText(topDeclineRow["OV YoY Change"] || "N/A");
    const ovPct = cleanInlineText(topDeclineRow["OV YoY %"] || "N/A");
    obs.push(`${pub} recorded the largest decline (${seg}), with OV movement ${ovDelta} (${ovPct}).`);
  }

  if (brandNew?.rows?.length) {
    const totalOv = brandNew.rows.reduce((sum, row) => sum + (parseNumber(row["Current OV"]) || 0), 0);
    obs.push(`${brandNew.rows.length} brand-new publishers were activated, contributing ${getCurrencySymbol(input.currencyCode)}${Math.round(totalOv).toLocaleString(input.locale || "en-GB")} in combined OV.`);
  }

  if (current?.rows?.length) {
    const top2 = current.rows.slice(0, 2).map((row) => ({
      name: cleanPublisherName(row.Publisher || "Publisher"),
      ov: parseNumber(row["Order Value"] || row["Current OV"] || row["Current Order Value"])
    }));
    if (top2.length === 2) {
      const top2Ov = top2.reduce((sum, item) => sum + (item.ov || 0), 0);
      const totalOv = (segment?.rows || []).reduce((sum, row) => sum + (parseNumber(row["Total OV"]) || 0), 0);
      const share = totalOv > 0 ? ` (${((top2Ov / totalOv) * 100).toFixed(1)}% of programme OV)` : "";
      obs.push(`Publisher concentration remains high: ${top2[0].name} and ${top2[1].name} account for ${getCurrencySymbol(input.currencyCode)}${Math.round(top2Ov).toLocaleString(input.locale || "en-GB")}${share}.`);
    }
  }

  const computed = pickNarrativeBullets(obs, 4).map(tidyObservationLine);
  if (computed.length) return computed;

  return [
    "Driver not confirmed from available segment and publisher data.",
    "No stable top publisher concentration signal available in current extract.",
    "New publisher contribution could not be quantified from available data.",
    "Review source publisher tables to confirm movement drivers."
  ];
}

function buildSegmentPerformanceBlocks(input) {
  const segment = input.tables.segmentSnapshot;
  if (!segment || !Array.isArray(segment.rows) || !segment.rows.length) {
    return [
      "Segment-level trend not available from current data extract.",
      "Use segment table to confirm YoY movement drivers before actioning.",
      "Cross-check top publishers per segment for concentration effects."
    ];
  }

  const cleanPublisherLabel = (value) =>
    cleanInlineText(value || "")
      .replace(/\s*-\s*I$/i, "")
      .replace(/\s*-\s*I(?=\s|$)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const iconBySegment = {
    voucher: "[V]",
    cashback: "[C]",
    other: "[O]",
    content: "[T]",
    css: "[CSS]"
  };

  const aiNarrativeCandidates = (input.publisherSections || [])
    .filter((section) =>
      /category snapshot|segment snapshot|publisher segment performance|confirmed changes|implications/i
        .test(cleanInlineText(section.title).toLowerCase())
    )
    .flatMap((section) => [...(section.bullets || []), ...(section.paragraphs || [])])
    .map((line) => cleanInlineText(line))
    .filter((line) => line.length >= 35 && line.length <= 420)
    .filter((line) => !/\bsite\s*id\b/i.test(line))
    .filter((line) => !/^\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i.test(line));

  const growthRows = (input.tables.topGrowthPublishers?.rows || []).map((row) => ({
    segment: cleanInlineText(row.Segment || ""),
    publisher: cleanPublisherLabel(row.Publisher || ""),
    salesCurrent: cleanInlineText(row["Current Sales"] || ""),
    salesPct: cleanInlineText(row["Sales YoY %"] || ""),
    ovDelta: cleanInlineText(row["OV YoY Change"] || ""),
    ovPct: cleanInlineText(row["OV YoY %"] || "")
  }));

  const declineRows = (input.tables.topDecliningPublishers?.rows || []).map((row) => ({
    segment: cleanInlineText(row.Segment || ""),
    publisher: cleanPublisherLabel(row.Publisher || ""),
    salesCurrent: cleanInlineText(row["Current Sales"] || ""),
    salesPct: cleanInlineText(row["Sales YoY %"] || ""),
    ovDelta: cleanInlineText(row["OV YoY Change"] || ""),
    ovPct: cleanInlineText(row["OV YoY %"] || "")
  }));
  const currentRows = (input.tables.topCurrentPerformers?.rows || []).map((row) => ({
    segment: cleanInlineText(row.Segment || ""),
    publisher: cleanPublisherLabel(row.Publisher || ""),
    ov: cleanInlineText(row["Order Value"] || row["Current OV"] || ""),
    sales: cleanInlineText(row["Current Sales"] || "")
  }));

  const preferredOrder = ["Voucher", "Cashback", "Other", "Content", "CSS"];
  const rows = segment.rows
    .map((row) => ({
      segment: cleanInlineText(row.Segment || "Segment"),
      publishers: cleanInlineText(row.Publishers || "N/A"),
      totalOv: cleanInlineText(row["Total OV"] || "-"),
      totalSales: cleanInlineText(row["Total Sales"] || "-"),
      ovYoy: cleanInlineText(row["OV YoY %"] || "N/A"),
      salesYoy: cleanInlineText(row["Sales YoY %"] || "N/A")
    }))
    .sort((a, b) => {
      const ai = preferredOrder.indexOf(a.segment);
      const bi = preferredOrder.indexOf(b.segment);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const clampDetail = (value, maxChars = 420) => {
    const text = cleanInlineText(value || "");
    if (!text || text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1).trimEnd()}â€¦`;
  };

  return rows.slice(0, 5).map((row) => {
    const icon = iconBySegment[row.segment.toLowerCase()] || "\u25AA";
    const growthForSegment = growthRows.find((item) => item.segment.toLowerCase() === row.segment.toLowerCase());
    const declineForSegment = declineRows.find((item) => item.segment.toLowerCase() === row.segment.toLowerCase());
    const topCurrentInSegment = currentRows
      .filter((item) => item.segment.toLowerCase() === row.segment.toLowerCase())
      .slice(0, 2);
    const movementParts = [];
    if (growthForSegment) {
      movementParts.push(`${growthForSegment.publisher} is the dominant growth driver, delivering ${growthForSegment.ovDelta} OV YoY (${growthForSegment.ovPct}).`);
    }
    if (declineForSegment) {
      movementParts.push(`${declineForSegment.publisher} is the primary drag, with ${declineForSegment.ovDelta} OV YoY (${declineForSegment.ovPct}).`);
    }
    if (topCurrentInSegment.length) {
      const contributorLine = topCurrentInSegment
        .map((item) => `${item.publisher}${item.ov ? ` (${item.ov})` : ""}`)
        .join(" and ");
      movementParts.push(`Leading current contributors include ${contributorLine}.`);
    }
    const movementLine = movementParts.join(" ");
    const defaultDetail = `${row.totalOv} total OV | ${row.publishers} active publishers | Sales: ${row.totalSales} (${row.salesYoy} YoY).${movementLine ? ` ${movementLine}` : ""}`;
    const aiDetail = aiNarrativeCandidates.find((line) =>
      new RegExp(`\\b${row.segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)
    );
    let detail = aiDetail && aiDetail.length > defaultDetail.length * 0.6
      ? `${defaultDetail} ${aiDetail}`
      : defaultDetail;
    detail = detail
      .replace(/\s*-\s*I\s+is\s+the\s+primary\s+drag/gi, " is the primary drag")
      .replace(/\s*-\s*I\s+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    detail = clampDetail(detail, 420);
    return `${icon} ${row.segment} - ${row.ovYoy} OV YoY\n${detail}`;
  });
}

function formatSignedCount(value, locale = "en-GB") {
  if (value === null || value === undefined) return "N/A";
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const rounded = Math.round(n);
  const abs = Math.abs(rounded).toLocaleString(locale || "en-GB");
  return `${rounded >= 0 ? "+" : "-"}${abs}`;
}

function buildSalesGrowthSignals(input) {
  if (Array.isArray(input.salesGrowthSignals) && input.salesGrowthSignals.length) {
    return input.salesGrowthSignals.slice(0, 5);
  }

  const m = input.metricMap || {};
  const segmentRows = input.tables.segmentSnapshot?.rows || [];
  const growthRows = input.tables.topGrowthPublishers?.rows || [];
  const declineRows = input.tables.topDecliningPublishers?.rows || [];
  const aovRows = input.tables.moversAov?.rows || [];
  const clickRows = input.tables.moversClicks?.rows || [];
  const currentRows = input.tables.topCurrentPerformers?.rows || [];

  const voucherRow = segmentRows.find((row) => cleanInlineText(row.Segment).toLowerCase() === "voucher");
  const cashbackRow = segmentRows.find((row) => cleanInlineText(row.Segment).toLowerCase() === "cashback");

  const topVoucherGrowth = growthRows
    .filter((row) => cleanInlineText(row.Segment).toLowerCase() === "voucher")
    .sort((a, b) => (parseNumber(b["OV YoY Change"]) || 0) - (parseNumber(a["OV YoY Change"]) || 0))[0];

  const topAovUps = aovRows
    .filter((row) => cleanInlineText(row.Direction).toLowerCase() === "up" || (parseNumber(row["YoY Change"]) || 0) > 0)
    .sort((a, b) => (parseNumber(b["YoY Change"]) || 0) - (parseNumber(a["YoY Change"]) || 0))
    .slice(0, 3);

  const topCashbackPublishers = currentRows
    .filter((row) => cleanInlineText(row.Segment).toLowerCase() === "cashback")
    .sort((a, b) => (parseNumber(b["Current Sales"]) || 0) - (parseNumber(a["Current Sales"]) || 0))
    .slice(0, 2);

  const topClickDecliners = clickRows
    .filter((row) => cleanInlineText(row.Direction).toLowerCase() === "down" || (parseNumber(row["YoY Change"]) || 0) < 0)
    .sort((a, b) => (parseNumber(a["YoY Change"]) || 0) - (parseNumber(b["YoY Change"]) || 0))
    .slice(0, 2);

  const clickLossAbs = Math.abs(parseNumber(m.clicks?.difference) || 0);
  const top2LossAbs = topClickDecliners.reduce((sum, row) => sum + Math.abs(parseNumber(row["YoY Change"]) || 0), 0);
  const top2Share = clickLossAbs > 0 ? `${((top2LossAbs / clickLossAbs) * 100).toFixed(0)}%` : "N/A";

  const signals = [
    {
      title: "Voucher Segment: Highest YoY Sales Growth",
      detail: voucherRow && topVoucherGrowth
        ? `The Voucher segment recorded ${cleanInlineText(voucherRow["Sales YoY %"] || "N/A")} sales growth and ${cleanInlineText(voucherRow["OV YoY %"] || "N/A")} OV growth YoY. ${cleanInlineText(topVoucherGrowth.Publisher || "Top voucher publisher")} delivered ${cleanInlineText(topVoucherGrowth["Current Sales"] || "N/A")} sales (${cleanInlineText(topVoucherGrowth["Sales YoY %"] || "N/A")}) and ${cleanInlineText(topVoucherGrowth["OV YoY Change"] || "N/A")} in OV (${cleanInlineText(topVoucherGrowth["OV YoY %"] || "N/A")}) year-over-year.`
        : "Voucher growth signal is not fully available in the current extract."
    },
    {
      title: `Conversion Rate: ${directionWord(m.convrate?.varianceValue) === "increased" ? "Improved" : "Moved"} to ${cleanInlineText(m.convrate?.current || "N/A")}`,
      detail: `Programme conversion rate moved from ${cleanInlineText(m.convrate?.previous || "N/A")} to ${cleanInlineText(m.convrate?.current || "N/A")} (${cleanInlineText(m.convrate?.variance || "N/A")}). Sales changed ${formatSignedCount(parseNumber(m.sales?.difference), input.locale)} while clicks changed ${formatSignedCount(parseNumber(m.clicks?.difference), input.locale)}, indicating the quality shift in converting traffic.`
    },
    {
      title: "AOV Growth Across Multiple Publishers",
      detail: topAovUps.length
        ? `Programme AOV moved ${cleanInlineText(m.aov?.variance || "N/A")} to ${cleanInlineText(m.aov?.current || "N/A")}. Largest AOV uplifts came from ${topAovUps.map((row) => `${cleanInlineText(row.Publisher || "Publisher")} (${cleanInlineText(row["YoY Change"] || "N/A")}, ${cleanInlineText(row["YoY %"] || "N/A")})`).join(", ")}.`
        : `Programme AOV moved ${cleanInlineText(m.aov?.variance || "N/A")} to ${cleanInlineText(m.aov?.current || "N/A")}.`
    },
    {
      title: "Cashback Segment: Largest Volume Base with Sales Decline",
      detail: cashbackRow
        ? `Cashback accounts for ${cleanInlineText(cashbackRow["Total OV"] || "N/A")} in OV (${cleanInlineText(cashbackRow["OV YoY %"] || "N/A")}) across ${cleanInlineText(cashbackRow.Publishers || "N/A")} publishers. ${topCashbackPublishers.length ? topCashbackPublishers.map((row) => `${cleanInlineText(row.Publisher || "Publisher")} (${cleanInlineText(row["Current Sales"] || "N/A")} sales, ${cleanInlineText(row["Sales YoY %"] || "N/A")})`).join(" and ") : "Top cashback contributors remain concentrated in a small group"} are the primary contributors by sales count.`
        : "Cashback segment-level signal is not fully available in the current extract."
    },
    {
      title: "Click Volume Decline Concentrated in Two Publishers",
      detail: topClickDecliners.length === 2
        ? `Total clicks changed ${cleanInlineText(m.clicks?.variance || "N/A")} (${cleanInlineText(m.clicks?.difference || "N/A")}). ${cleanInlineText(topClickDecliners[0].Publisher || "Publisher 1")} contributed ${cleanInlineText(topClickDecliners[0]["YoY Change"] || "N/A")} (${cleanInlineText(topClickDecliners[0]["YoY %"] || "N/A")}) and ${cleanInlineText(topClickDecliners[1].Publisher || "Publisher 2")} contributed ${cleanInlineText(topClickDecliners[1]["YoY Change"] || "N/A")} (${cleanInlineText(topClickDecliners[1]["YoY %"] || "N/A")}), together representing approximately ${top2Share} of total click loss.`
        : "Top click decline concentration could not be confirmed from available movers data."
    }
  ];

  return signals.slice(0, 5);
}

function readTableCell(row, aliases) {
  if (!row || typeof row !== "object") return "";
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return cleanInlineText(row[alias] || "");
    const key = Object.keys(row).find((candidate) => cleanInlineText(candidate).toLowerCase() === alias.toLowerCase());
    if (key) return cleanInlineText(row[key] || "");
  }
  return "";
}

function compactLabel(value, maxLen = 36) {
  const text = cleanInlineText(value || "");
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}\u2026`;
}

function buildDirectionalMoversTable(table, title, columns, upCount = 5, downCount = 5) {
  const fallback = {
    title,
    columns,
    colW: [3.5, 1.8, 2.1, 2.1, 1.5],
    rows: [["Top 5 Up", "", "", "", ""], ...Array.from({ length: 1 }, () => ["-", "-", "-", "-", "-"]), ["Top 5 Down", "", "", "", ""], ...Array.from({ length: 1 }, () => ["-", "-", "-", "-", "-"])]
  };
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return fallback;

  const rows = table.rows.map((row) => {
    const publisher = compactLabel(readTableCell(row, ["Publisher", "Program Name", "Program", "Name"]), 36);
    const siteId = readTableCell(row, ["Site ID", "SiteID", "Site Id", "Program ID", "ProgramId", "ProgramID"]);
    const current = readTableCell(row, [columns[2]]);
    const yoyChange = readTableCell(row, ["YoY Change", "Sales YoY Change", "OV YoY Change", "Clicks YoY Change"]);
    const yoyPct = readTableCell(row, ["YoY %", "Sales YoY %", "OV YoY %", "Clicks YoY %"]);
    const direction = readTableCell(row, ["Direction"]).toLowerCase();
    const numericChange = parseNumber(yoyChange) ?? parseNumber(yoyPct) ?? 0;

    const derivedDirection = direction
      ? direction
      : numericChange < 0
        ? "down"
        : numericChange > 0
          ? "up"
          : "";

    return { publisher, siteId, current, yoyChange, yoyPct, direction: derivedDirection, numericChange };
  });

  const up = rows
    .filter((row) => row.direction === "up" || row.numericChange > 0)
    .sort((a, b) => (b.numericChange || 0) - (a.numericChange || 0))
    .slice(0, upCount);

  const down = rows
    .filter((row) => row.direction === "down" || row.numericChange < 0)
    .sort((a, b) => (a.numericChange || 0) - (b.numericChange || 0))
    .slice(0, downCount);

  const outputRows = [];
  outputRows.push(["Top 5 Up", "", "", "", ""]);
  if (up.length) {
    up.forEach((row) => outputRows.push([row.publisher || "-", row.siteId || "-", row.current || "-", row.yoyChange || "-", row.yoyPct || "-"]));
  } else {
    outputRows.push(["-", "-", "-", "-", "-"]);
  }

  outputRows.push(["Top 5 Down", "", "", "", ""]);
  if (down.length) {
    down.forEach((row) => outputRows.push([row.publisher || "-", row.siteId || "-", row.current || "-", row.yoyChange || "-", row.yoyPct || "-"]));
  } else {
    outputRows.push(["-", "-", "-", "-", "-"]);
  }

  return {
    title,
    columns,
    colW: [3.5, 1.8, 2.1, 2.1, 1.5],
    rows: outputRows
  };
}

function buildActionBullets(input) {
  const recommendations = input.recommendations.slice(0, 5);
  if (recommendations.length) return recommendations;

  const fromProgram = input.programSections.flatMap((section) => section.bullets).slice(0, 5);
  if (fromProgram.length) return fromProgram;

  const fromPublisher = input.publisherSections.flatMap((section) => section.bullets).slice(0, 5);
  if (fromPublisher.length) return fromPublisher;

  return [
    "Confirm top growth and decline publishers with account teams.",
    "Prioritize actions linked directly to measured KPI movement.",
    "Track impact owners and deadlines before the next QBR cycle."
  ];
}

function directionWord(varianceValue) {
  if (varianceValue === null || varianceValue === undefined || Number.isNaN(Number(varianceValue))) return "changed";
  if (Number(varianceValue) > 0) return "increased";
  if (Number(varianceValue) < 0) return "decreased";
  return "was flat";
}

function metricSentence(label, metric, includeDelta = true) {
  if (!metric) return `${label}: data not available.`;
  if (!includeDelta) return `${label}: ${metric.current || "-"}.`;
  const dir = directionWord(metric.varianceValue);
  const variance = metric.variance || "N/A";
  return `${label} ${dir} ${variance} (${metric.previous || "-"} to ${metric.current || "-"}).`;
}

function getTopDirection(table, directionLabel) {
  const base = tableRows(table, 20);
  if (!base || !base.rows.length) return null;
  const dirIdx = base.columns.findIndex((column) => cleanInlineText(column).toLowerCase() === "direction");
  const pubIdx = base.columns.findIndex((column) => cleanInlineText(column).toLowerCase().includes("publisher"));
  const changeIdx = base.columns.findIndex((column) => cleanInlineText(column).toLowerCase().includes("yoy change"));
  if (dirIdx === -1 || pubIdx === -1) return null;
  const row = base.rows.find((candidate) => cleanInlineText(candidate[dirIdx]).toLowerCase() === cleanInlineText(directionLabel).toLowerCase());
  if (!row) return null;
  const publisher = row[pubIdx] || "Publisher";
  const change = changeIdx > -1 ? row[changeIdx] : "";
  return change ? `${publisher} (${change})` : publisher;
}

function buildKpiAnalysisBullets(input) {
  const m = input.metricMap;
  const sales = m.sales;
  const clicks = m.clicks;
  const conv = m.convrate;
  const ov = m.ordervalue;
  const aov = m.aov;
  const cpa = m.cpa;
  const roi = m.roi;
  const cleanPublisherLabel = (value) =>
    cleanInlineText(value || "")
      .replace(/\s*-\s*I$/i, "")
      .replace(/\s*-\s*I(?=\s|$)/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  const aiCandidatesRaw = (input.programSections || [])
    .filter((section) =>
      /kpi snapshot|kpi highlights|business implications|confirmed changes|program performance|kpi/i
        .test(cleanInlineText(section.title).toLowerCase())
    )
    .flatMap((section) => [...(section.bullets || []), ...(section.paragraphs || [])])
    .map((line) => cleanInlineText(line))
    .filter((line) => line.length >= 14 && line.length <= 360)
    .filter((line) => !/\bsite\s*id\b/i.test(line))
    .filter((line) => !/^\s*program\s*id\s*\d+/i.test(line))
    .filter((line) => !/^\s*program\s*\d+\b/i.test(line))
    .filter((line) => !/\btotal order value\b[\s:;,-]*.*\byoy change\b/i.test(line))
    .filter((line) => !/\bcurrent sales:\b|\bcurrent ov:\b|\bov yoy change:\b|\bsales yoy %:\b/i.test(line))
    .filter((line) => !/^\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i.test(line));

  const isHeadingLike = (line) => {
    if (!line) return false;
    if (line.length > 70) return false;
    if (/[.:;!?]$/.test(line)) return false;
    if (/^[+\-]?\d/.test(line)) return false;
    return /^[A-Za-z0-9&()\-/' ]+$/.test(line);
  };

  const aiCandidates = [];
  for (let i = 0; i < aiCandidatesRaw.length; i += 1) {
    const current = aiCandidatesRaw[i];
    const next = aiCandidatesRaw[i + 1];
    if (isHeadingLike(current) && next && !isHeadingLike(next)) {
      aiCandidates.push(`${current}: ${next}`);
      i += 1;
      continue;
    }
    if (isHeadingLike(current)) continue;
    aiCandidates.push(current);
  }

  const looksLikeRawKpiSnapshot = (line) =>
    /^(sales|order value|clicks|conv rate|conversion rate|aov|publ commission|publisher commission|total commission|cpa|roi)\s*:/i
      .test(cleanInlineText(line));
  const looksLikeProgramListing = (line) =>
    /^\s*program\s*id\s*\d+/i.test(cleanInlineText(line))
    || /^\s*program\s*\d+\b/i.test(cleanInlineText(line))
    || /\btotal order value\b[\s:;,-]*.*\byoy change\b/i.test(cleanInlineText(line));

  const preferredAi = aiCandidates
    .filter((line) => !looksLikeRawKpiSnapshot(line) && !looksLikeProgramListing(line))
    .map((line) => cleanInlineText(line))
    .filter(Boolean);

  const moversSales = input.tables.moversSales;
  const topUp = getTopDirection(moversSales, "Up");
  const topDown = getTopDirection(moversSales, "Down");

  const growthTop = input.tables.topGrowthPublishers?.rows?.[0] || null;
  const declineTop = input.tables.topDecliningPublishers?.rows?.[0] || null;
  const declineRows = (input.tables.topDecliningPublishers?.rows || []).slice(0, 3);
  const declineList = declineRows
    .map((row) => `${cleanPublisherLabel(row.Publisher || "Publisher")} (${cleanInlineText(row["Sales YoY %"] || row["YoY Change"] || "N/A")})`)
    .filter(Boolean)
    .join(", ");

  const topAovUpliftRow = (input.tables.moversAov?.rows || [])
    .filter((row) => cleanInlineText(row.Direction || "").toLowerCase() === "up")
    .sort((a, b) => (parseNumber(b["YoY Change"]) || 0) - (parseNumber(a["YoY Change"]) || 0))[0];
  const topAovUpliftText = topAovUpliftRow
    ? `${cleanPublisherLabel(topAovUpliftRow.Publisher || "Top publisher")} recorded one of the strongest AOV uplifts (${cleanInlineText(topAovUpliftRow["YoY Change"] || "N/A")}, ${cleanInlineText(topAovUpliftRow["YoY %"] || "N/A")}).`
    : "AOV uplift was concentrated in a smaller set of higher-value publishers.";

  const bullets = [
    `Conversion Rate Improvement: ${metricSentence("Conversion rate", conv)} Click volume ${directionWord(clicks?.varianceValue)} ${clicks?.variance || "N/A"} (${clicks?.difference || "-"}) while sales ${directionWord(sales?.varianceValue)} ${sales?.variance || "N/A"} (${sales?.difference || "-"}), indicating a more efficient sales-to-click mix than in the prior year.`,
    `Sales Volume Pressure: Total sales ${directionWord(sales?.varianceValue)} ${sales?.variance || "N/A"} (${sales?.difference || "-"}). Click volume ${directionWord(clicks?.varianceValue)} ${clicks?.variance || "N/A"} (${clicks?.difference || "-"}). ${declineList ? `Largest declines came from ${declineList}.` : "Largest declining publisher contribution requires confirmation from mover tables."}`,
    `AOV Growth Partially Offsetting Volume Decline: ${metricSentence("AOV", aov)} Total order value ${directionWord(ov?.varianceValue)} ${ov?.variance || "N/A"} (${ov?.difference || "-"}) despite lower transaction volume. ${topAovUpliftText}`,
    `Rising CPA: ${metricSentence("CPA", cpa)} Publisher commission changed ${m.publcommission?.variance || "N/A"} (${m.publcommission?.difference || "-"}) year-over-year, so each conversion carried a higher acquisition cost.`,
    `ROI Trend: ${metricSentence("ROI", roi)} For every unit of commission in the current period, programme return moved from ${roi?.previous || "-"} to ${roi?.current || "-"}, showing marginal improvement in spend efficiency.`
  ];
  const generated = bullets.map((line) => cleanInlineText(line)).filter(Boolean);
  const merged = [];
  const aiForUse = preferredAi.length >= 3 ? preferredAi : [];
  // Keep rich, structured generated narrative first; then use AI lines as supplements.
  [...generated, ...aiForUse].forEach((line) => {
    const key = line.toLowerCase();
    if (merged.some((existing) => existing.toLowerCase() === key)) return;
    merged.push(line);
  });
  return merged.slice(0, 5).map((line) => cleanInlineText(line)).filter(Boolean);
}

function buildCostCallout(input) {
  const m = input.metricMap;
  const base = "ROI = Total Order Value \u00F7 Total Commission. A higher ROI indicates greater return per \u00A31 of commission spend.";
  const pub = m.publcommission;
  const total = m.totalcommission;
  if (!pub || !total) return base;

  const pubCurrent = cleanInlineText(pub.current || "");
  const totalCurrent = cleanInlineText(total.current || "");
  if (pubCurrent && totalCurrent && pubCurrent === totalCurrent) {
    return `${base} Publisher Commission and Total Commission are equal in this period - no overrides recorded.`;
  }
  return base;
}

function buildRiskRows(input) {
  const sourceLines = [];
  const appendLines = (lines) => {
    (lines || []).forEach((line) => {
      const text = cleanInlineText(line);
      if (!text) return;
      if (sourceLines.some((existing) => existing.toLowerCase() === text.toLowerCase())) return;
      sourceLines.push(text);
    });
  };

  appendLines(input.publisherOverviewObservations);
  appendLines(buildPublisherOverviewBullets(input));
  appendLines(buildKpiAnalysisBullets(input));

  const inferRiskLabel = (text) => {
    const lower = cleanInlineText(text).toLowerCase();
    if (/(concentration|top\s+\d+\s+publisher|dependency|dependenc)/.test(lower)) return "Publisher concentration risk";
    if (/\bcpa\b|commission|cost per acquisition/.test(lower)) return "Rising CPA trend";
    if (/click|traffic|volume decline/.test(lower)) return "Traffic decline";
    if (/aov|order value|ov /.test(lower)) return "Order value mix volatility";
    if (/\broi\b|return on investment/.test(lower)) return "Return efficiency risk";
    if (/conversion/.test(lower)) return "Conversion quality dependency";
    return "Performance variance risk";
  };

  const inferImpact = (text) => {
    const lower = cleanInlineText(text).toLowerCase();
    if (/(declined|decrease|drop|largest decline|risk|high|pressure)/.test(lower)) return "High";
    if (/(marginal|flat|mixed|moderate|watch)/.test(lower)) return "Medium";
    return "Medium";
  };

  const rows = sourceLines
    .slice(0, 5)
    .map((line) => [
      inferRiskLabel(line),
      inferImpact(line),
      line
    ]);

  if (rows.length) return rows;

  return [
    [
      "Publisher concentration risk",
      "High",
      "Publisher concentration remains elevated; diversify publisher mix and reduce reliance on the top contributors."
    ],
    [
      "Rising CPA trend",
      "High",
      "Review commission structure and cost controls where CPA growth is outpacing sales efficiency."
    ],
    [
      "Traffic decline",
      "Medium",
      "Investigate traffic source quality and reactivate declining publishers with the strongest historical contribution."
    ]
  ];
}

function canonicalPublisherSlideKey(rawKey) {
  const key = cleanInlineText(rawKey).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) return "";
  const aliases = {
    quarterly_business_review_cover: "cover",
    executive: "executive_summary",
    executive_overview: "executive_summary",
    kpi_summary: "kpi_summary_table",
    program_breakdown: "program_level_analysis",
    summary_next_steps: "sales_growth_risk_dependencies",
    movers_shakers_commission: "movers_commission",
    movers_shakers_sales: "movers_sales",
    movers_shakers_clicks: "movers_clicks",
    sales_growth_signals_and_risk_and_dependencies: "sales_growth_risk_dependencies",
    sales_growth_signals_risk_dependencies: "sales_growth_risk_dependencies",
    sales_growth_and_risk_dependencies: "sales_growth_risk_dependencies",
    risks_and_dependencies: "risks_dependencies",
    thankyou: "thank_you"
  };
  return aliases[key] || key;
}

function defaultPublisherProgramSlideBlueprint() {
  return [
    { slide: 1, key: "cover", title: "Quarterly Business Review Cover" },
    { slide: 2, key: "executive_summary", title: "Executive Summary" },
    { slide: 3, key: "publisher_performance_summary", title: "Publisher Performance Summary" },
    { slide: 4, key: "kpi_summary_table", title: "KPI Summary" },
    { slide: 5, key: "program_level_analysis", title: "Program Level Analysis" },
    { slide: 6, key: "kpi_highlights", title: "KPI Highlights" },
    { slide: 7, key: "movers_commission", title: "Movers & Shakers - Commission" },
    { slide: 8, key: "movers_sales", title: "Movers & Shakers - Sales" },
    { slide: 9, key: "movers_clicks", title: "Movers & Shakers - Clicks" },
    { slide: 10, key: "brand_new_programs", title: "Brand New Programs" },
    { slide: 11, key: "sales_growth_risk_dependencies", title: "Sales Growth Signals & Risk and Dependencies" },
    { slide: 12, key: "thank_you", title: "Thank You" }
  ];
}

function resolvePublisherProgramSlideBlueprint(input) {
  const provided = Array.isArray(input.slideBlueprint) && input.slideBlueprint.length
    ? input.slideBlueprint
    : defaultPublisherProgramSlideBlueprint();

  const normalized = provided
    .map((item, index) => ({
      slide: normalizePositiveInt(item.slide, index + 1),
      key: canonicalPublisherSlideKey(item.key || item.id || item.kind || ""),
      title: cleanInlineText(item.title || "")
    }))
    .filter((item) => item.key)
    .sort((a, b) => a.slide - b.slide);

  if (input.targetSlides > 0) return normalized.slice(0, input.targetSlides);
  return normalized;
}

function boundTableKeysForSlide(input, slideKey, fallbackKeys = []) {
  const bindings = input.slideTableBindings || {};
  const normalizedSlideKey = canonicalPublisherSlideKey(slideKey);
  const fallbackBindingKey = cleanInlineText(slideKey).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const bindingKeys = Array.from(new Set([normalizedSlideKey, fallbackBindingKey].filter(Boolean)));

  const mappedCandidates = [];
  bindingKeys.forEach((key) => {
    const mapped = bindings[key];
    if (Array.isArray(mapped)) mappedCandidates.push(...mapped);
  });

  const candidates = [...mappedCandidates, ...fallbackKeys]
    .map((candidate) => normalizeTableKey(candidate))
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function boundTableForSlide(input, slideKey, fallbackKeys = []) {
  const candidates = boundTableKeysForSlide(input, slideKey, fallbackKeys);
  for (const candidate of candidates) {
    if (input.tables[candidate]) return input.tables[candidate];
  }
  return null;
}

function boundTablesForSlide(input, slideKey, fallbackKeys = []) {
  return boundTableKeysForSlide(input, slideKey, fallbackKeys)
    .map((key) => input.tables[key])
    .filter(Boolean);
}

function buildKpiHighlightsBulletsFromTable(table) {
  const base = tableRows(table, 16);
  if (!base || !base.rows.length) return [];
  const lookup = (aliases) => {
    const idx = base.columns.findIndex((column) => aliases.includes(cleanInlineText(column).toLowerCase()));
    return idx;
  };
  const idxKpi = lookup(["kpi", "metric"]);
  const idxRecent = lookup(["recent", "current", "current period"]);
  const idxPrevious = lookup(["previous", "prior year"]);
  const idxYoY = lookup(["yoy %", "% variance", "variance"]);
  const idxHighlight = lookup(["highlight", "bullet", "detail", "text", "narrative"]);

  if (idxKpi < 0 && idxRecent < 0 && idxPrevious < 0 && idxYoY < 0 && idxHighlight > -1) {
    return base.rows
      .map((row) => cleanInlineText(row[idxHighlight] || ""))
      .filter(Boolean)
      .slice(0, 12);
  }

  return base.rows
    .slice(0, 12)
    .map((row) => {
      const kpi = idxKpi > -1 ? cleanInlineText(row[idxKpi] || "") : "";
      const recent = idxRecent > -1 ? cleanInlineText(row[idxRecent] || "") : "";
      const previous = idxPrevious > -1 ? cleanInlineText(row[idxPrevious] || "") : "";
      const yoy = idxYoY > -1 ? cleanInlineText(row[idxYoY] || "") : "";
      if (!kpi) return "";
      if (recent && previous && yoy) return `${kpi}: ${recent} vs ${previous} (${yoy}).`;
      if (recent && previous) return `${kpi}: ${recent} vs ${previous}.`;
      if (recent) return `${kpi}: ${recent}.`;
      return "";
    })
    .filter(Boolean);
}

function buildSalesRiskDependenciesTable(input, salesGrowthTable, riskDependenciesTable) {
  const growthBase = tableRows(salesGrowthTable, 5);
  const riskBase = tableRows(riskDependenciesTable, 5);
  const rows = [];

  if (growthBase && growthBase.rows.length) {
    const findGrowthCol = (aliases) =>
      growthBase.columns.findIndex((column) => aliases.includes(cleanInlineText(column).toLowerCase()));
    const idxProgram = findGrowthCol(["program", "program name", "publisher", "name"]);
    const idxSalesYoY = findGrowthCol(["sales yoy %", "yoy %", "sales % yoy"]);
    const idxSalesChange = findGrowthCol(["sales yoy change", "yoy change"]);
    const idxOvChange = findGrowthCol(["order value yoy change"]);
    const idxCommChange = findGrowthCol(["commission yoy change"]);

    growthBase.rows.slice(0, 5).forEach((row) => {
      const program = idxProgram > -1 ? cleanInlineText(row[idxProgram] || "-") : "-";
      const signal = idxSalesYoY > -1
        ? `Sales YoY ${cleanInlineText(row[idxSalesYoY] || "-")}`
        : idxSalesChange > -1
          ? `Sales Change ${cleanInlineText(row[idxSalesChange] || "-")}`
          : "Positive movement";
      const details = [
        idxOvChange > -1 ? `OV ${cleanInlineText(row[idxOvChange] || "-")}` : "",
        idxCommChange > -1 ? `Commission ${cleanInlineText(row[idxCommChange] || "-")}` : ""
      ].filter(Boolean).join(" | ");
      rows.push(["Growth Signal", program || "-", signal, details || "-"]);
    });
  }

  if (riskBase && riskBase.rows.length) {
    const findRiskCol = (aliases) =>
      riskBase.columns.findIndex((column) => aliases.includes(cleanInlineText(column).toLowerCase()));
    const idxProgram = findRiskCol(["program", "program name", "publisher", "name"]);
    const idxRiskType = findRiskCol(["risk type", "risk", "type"]);
    const idxEvidence = findRiskCol(["evidence", "detail", "mitigation", "note"]);

    riskBase.rows.slice(0, 5).forEach((row) => {
      const program = idxProgram > -1 ? cleanInlineText(row[idxProgram] || "-") : "-";
      const risk = idxRiskType > -1 ? cleanInlineText(row[idxRiskType] || "Risk") : "Risk";
      const evidence = idxEvidence > -1 ? cleanInlineText(row[idxEvidence] || "-") : "-";
      rows.push(["Risk / Dependency", program || "-", risk || "Risk", evidence || "-"]);
    });
  }

  return {
    title: "Sales Growth Signals & Risk and Dependencies",
    columns: ["Type", "Program", "Signal / Risk", "Detail"],
    colW: [1.9, 3.0, 2.3, 5.5],
    rows: rows.length ? rows : [["-", "-", "-", "-"]],
    dense: false
  };
}

function buildPublisherProgramDeckSpec(input, theme) {
  const slides = [];
  const headline = buildHeadline(input);
  const executiveNarrative = buildExecutiveSummaryText(input);
  const reportingSummary = `${input.reportingPeriod} vs ${input.comparisonPeriod}`;
  const blueprint = resolvePublisherProgramSlideBlueprint(input);

  const executiveCardConfig = [
    { key: "sales", label: "Sales", iconKey: "sales", icon: "\u2630" },
    { key: "ordervalue", label: "Total Order Value", iconKey: "ordervalue", icon: "\u25A4" },
    { key: "aov", label: "Average Order Value (AOV)", iconKey: "aov", icon: "\u2197" },
    { key: "convrate", label: "Conversion Rate", iconKey: "convrate", icon: "\u26A1" },
    { key: "roi", label: "ROI", iconKey: "roi", icon: "\u21BB" }
  ];

  const topCards = executiveCardConfig
    .map((cfg) => {
      const card = metricCard(input.metricMap[cfg.key]);
      if (!card) return null;
      const hasIconPath = Boolean(cfg.iconKey && HAS_KPI_ICON[cfg.iconKey]);
      return {
        ...card,
        label: cfg.label,
        icon: cfg.icon,
        iconPath: hasIconPath ? KPI_ICON_PATHS[cfg.iconKey] : ""
      };
    })
    .filter(Boolean);

  const publisherOverviewBullets = buildPublisherOverviewBullets(input);
  const fallbackKpiBullets = buildKpiAnalysisBullets(input);
  const kpiHighlightTables = boundTablesForSlide(input, "kpi_highlights", ["kpiHighlights", "kpiHighlightNarrative"]);
  const kpiHighlightsBullets = kpiHighlightTables.flatMap((table) => buildKpiHighlightsBulletsFromTable(table));
  const mergedKpiBullets = [];
  for (const bullet of [...kpiHighlightsBullets, ...fallbackKpiBullets]) {
    const text = cleanInlineText(bullet || "");
    if (!text) continue;
    if (mergedKpiBullets.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    mergedKpiBullets.push(text);
    if (mergedKpiBullets.length >= 12) break;
  }
  const kpiAnalysisBullets = mergedKpiBullets.length ? mergedKpiBullets : fallbackKpiBullets;

  const publisherPerformanceSummaryTable = tableOrPlaceholderNoRank(
    boundTableForSlide(input, "publisher_performance_summary", ["publisherPerformanceSummary"]),
    "Publisher Performance Summary",
    ["Metric", "Recent", "Previous", "Difference", "% Variance"],
    12
  );

  const kpiSummaryBoundTables = boundTablesForSlide(input, "kpi_summary_table", ["kpiSummary", "kpiVarianceColorHints"]);
  const kpiSummarySourceTable = kpiSummaryBoundTables.find((table) => cleanInlineText(table && table.key).toLowerCase() !== "kpivariancecolorhints")
    || boundTableForSlide(input, "kpi_summary_table", ["kpiSummary"]);
  const kpiSummaryTable = tableOrPlaceholderNoRank(
    kpiSummarySourceTable,
    "KPI Summary",
    ["Period", "Clicks", "Sales", "Conv Rate", "AOV", "EPC", "Order Value", "Publisher Commission", "Active Programs", "Programs w/ Commission"],
    8
  );
  const kpiVarianceHintsTable = kpiSummaryBoundTables.find((table) => cleanInlineText(table && table.key).toLowerCase() === "kpivariancecolorhints")
    || boundTableForSlide(input, "kpi_variance_color_hints", ["kpiVarianceColorHints"]);
  const varianceColorMap = extractVarianceToneMap(kpiVarianceHintsTable);
  if (Object.keys(varianceColorMap).length) {
    kpiSummaryTable.varianceColorMap = varianceColorMap;
  }

  const boundProgramBreakdown = boundTableForSlide(input, "program_level_analysis", ["programLevelBreakdown"]);
  const rankedProgramBreakdown = boundProgramBreakdown ? sortProgramLevelAnalysisTable(boundProgramBreakdown) : null;
  const programBreakdownTable = boundProgramBreakdown
    ? tableOrPlaceholderNoRank(
      rankedProgramBreakdown,
      "Program Level Breakdown",
      ["Program ID", "Program Name", "Clicks", "Sales", "Order Value", "Commission", "Comm YoY %", "Sales YoY %", "Clicks YoY %"],
      12
    )
    : buildProgramBreakdownTable(input);

  const moversCommission = boundTableForSlide(input, "movers_commission", ["moversCommission"]);
  const moversSales = boundTableForSlide(input, "movers_sales", ["moversSales"]);
  const moversClicks = boundTableForSlide(input, "movers_clicks", ["moversClicks"]);

  const brandNewProgramsTable = tableOrPlaceholderNoRank(
    boundTableForSlide(input, "brand_new_programs", ["brandNewPrograms"]),
    "Brand New Programs",
    ["Program ID", "Program Name", "Clicks", "Sales", "Order Value", "Commission"],
    10
  );

  const salesGrowthTable = boundTableForSlide(input, "sales_growth_risk_dependencies", ["salesGrowthSignals"]);
  const riskDependenciesTable = boundTableForSlide(input, "sales_growth_risk_dependencies", ["riskDependencies"]);
  const salesRiskDependenciesTable = buildSalesRiskDependenciesTable(input, salesGrowthTable, riskDependenciesTable);
  const salesGrowthSignals = buildSalesGrowthSignals(input);

  for (const blueprintSlide of blueprint) {
    const key = canonicalPublisherSlideKey(blueprintSlide.key);
    const customTitle = cleanInlineText(blueprintSlide.title || "");

    if (key === "cover") {
      slides.push({
        id: "cover",
        kind: "cover",
        title: `${input.client} Affiliate Program Quarterly Business Review`,
        subtitle: "",
        headline,
        summary: input.qbrFocusDetail
          ? `${input.qbrFocus}. ${input.qbrFocusDetail}`
          : `A comprehensive year-over-year analysis of the ${input.client} affiliate program's performance, publisher dynamics, and strategic priorities to drive growth and optimise outcomes.`,
        bullets: [`Client: ${input.client}`, `Reporting currency: ${input.currencyCode}`, `Language: ${input.languageName}`],
        kpis: [],
        tables: []
      });
      continue;
    }

    if (key === "reporting_period") {
      slides.push({
        id: "reporting-period",
        kind: "reporting-period",
        title: customTitle || "Reporting Period",
        subtitle: "Current and YoY comparison windows",
        headline: "",
        summary: "",
        bullets: [
          `Current period: ${input.reportingPeriod}`,
          `Comparison period: ${input.comparisonPeriod}`,
          `Primary focus: ${input.qbrFocus}${input.qbrFocusDetail ? ` - ${input.qbrFocusDetail}` : ""}`
        ],
        kpis: [],
        tables: [],
        callout: `All figures are reported in ${input.currencyCode} unless otherwise stated. YoY variance is calculated as current period vs comparison period.`
      });
      continue;
    }

    if (key === "executive_summary") {
      slides.push({
        id: "executive-summary",
        kind: "program-executive-summary",
        title: customTitle || "Executive Summary",
        headline: "",
        summary: executiveNarrative,
        bullets: [],
        kpis: topCards,
        tables: []
      });
      continue;
    }

    if (key === "publisher_performance_summary") {
      slides.push({
        id: "publisher-performance-summary",
        kind: "publisher-overview",
        title: customTitle || "Publisher Performance Summary",
        subtitle: reportingSummary,
        bullets: publisherOverviewBullets.slice(0, 4),
        kpis: [],
        tables: [publisherPerformanceSummaryTable]
      });
      continue;
    }

    if (key === "kpi_summary_table") {
      slides.push({
        id: "kpi-summary",
        kind: "kpi-table",
        title: customTitle || "KPI Summary",
        subtitle: "Unified KPI breakdown vs prior year.",
        bullets: [],
        kpis: [],
        tables: [kpiSummaryTable]
      });
      continue;
    }

    if (key === "program_level_analysis") {
      slides.push({
        id: "program-level-analysis",
        kind: "program-breakdown",
        title: customTitle || "Program Level Analysis",
        subtitle: "Per-program publisher performance for current period vs prior year.",
        bullets: [],
        kpis: [],
        tables: [programBreakdownTable]
      });
      continue;
    }

    if (key === "kpi_highlights") {
      slides.push({
        id: "kpi-highlights",
        kind: "insights-blue",
        title: customTitle || "KPI Highlights",
        subtitle: "What the numbers mean for the business - key signals and context.",
        bullets: kpiAnalysisBullets,
        kpis: [],
        tables: []
      });
      continue;
    }

    if (key === "movers_commission") {
      slides.push({
        id: "movers-shakers-commission",
        kind: "publisher-table",
        title: customTitle || "Movers & Shakers - Commission",
        subtitle: "Largest YoY commission movers and decliners.",
        bullets: [],
        kpis: [],
        tables: [
          buildDirectionalMoversTable(moversCommission, "Movers & Shakers - Commission", [
            "Program",
            "Program ID",
            "Current Commission",
            "YoY Change",
            "YoY %"
          ])
        ],
        callout: "Up = positive YoY movement; Down = negative YoY movement."
      });
      continue;
    }

    if (key === "movers_sales") {
      slides.push({
        id: "movers-shakers-sales",
        kind: "publisher-table",
        title: customTitle || "Movers & Shakers - Sales",
        subtitle: "Largest YoY sales movers and decliners.",
        bullets: [],
        kpis: [],
        tables: [
          buildDirectionalMoversTable(moversSales, "Movers & Shakers - Sales", [
            "Program",
            "Program ID",
            "Current Sales",
            "YoY Change",
            "YoY %"
          ])
        ],
        callout: "Up = positive YoY movement; Down = negative YoY movement."
      });
      continue;
    }

    if (key === "movers_clicks") {
      slides.push({
        id: "movers-shakers-clicks",
        kind: "publisher-table",
        title: customTitle || "Movers & Shakers - Clicks",
        subtitle: "Largest YoY click movers and decliners.",
        bullets: [],
        kpis: [],
        tables: [
          buildDirectionalMoversTable(moversClicks, "Movers & Shakers - Clicks", [
            "Program",
            "Program ID",
            "Current Clicks",
            "YoY Change",
            "YoY %"
          ])
        ],
        callout: "Traffic movement helps explain volume and conversion shifts across program mix."
      });
      continue;
    }

    if (key === "brand_new_programs") {
      slides.push({
        id: "brand-new-programs",
        kind: "publisher-table",
        title: customTitle || "Brand New Programs",
        subtitle: "Programs activated for the first time in the current period.",
        bullets: [],
        kpis: [],
        tables: [brandNewProgramsTable],
        callout: "Brand-new programs are not included in YoY comparisons until a prior-year baseline exists."
      });
      continue;
    }

    if (key === "sales_growth_signals") {
      slides.push({
        id: "sales-growth-signals",
        kind: "sales-growth-signals-blue",
        title: customTitle || "Sales Growth Signals",
        subtitle: `Factual observations from the data relevant to programme's sales performance - ${input.reportingPeriod}.`,
        bullets: [],
        signals: salesGrowthSignals,
        kpis: [],
        tables: []
      });
      continue;
    }

    if (key === "sales_growth_risk_dependencies" || key === "risks_dependencies") {
      slides.push({
        id: "sales-growth-risk-dependencies",
        kind: "risks-dependencies",
        title: customTitle || "Sales Growth Signals & Risk and Dependencies",
        subtitle: "Growth indicators and key risks/dependencies for the next review cycle.",
        bullets: [],
        kpis: [],
        tables: [salesRiskDependenciesTable]
      });
      continue;
    }

    if (key === "thank_you") {
      slides.push({
        id: "thank-you",
        kind: "thank-you",
        title: `${input.client} - Thank you.`,
        subtitle: "",
        bullets: [],
        kpis: [],
        tables: []
      });
      continue;
    }
  }

  if (!slides.length) {
    return buildDeckSpec({ ...input, analysisLevel: "" }, theme);
  }

  return {
    metadata: {
      requestId: input.requestId,
      client: input.client,
      deckTitle: input.deckTitle,
      reportingPeriod: input.reportingPeriod,
      comparisonPeriod: input.comparisonPeriod,
      languageCode: input.languageCode,
      languageName: input.languageName,
      locale: input.locale || "en-GB",
      uiLabels: uiLabelsForLanguage(input.languageCode),
      currencyCode: input.currencyCode,
      qbrFocus: input.qbrFocus,
      analysisProgramIds: Array.isArray(input.analysisProgramIds) ? input.analysisProgramIds : [],
      generatedAt: new Date().toISOString()
    },
    theme,
    slides
  };
}

function buildDeckSpec(input, theme) {
  if (cleanInlineText(input.analysisLevel).toLowerCase() === "publisher_program") {
    return buildPublisherProgramDeckSpec(input, theme);
  }

  const slides = [];
  const headline = buildHeadline(input);
  const executiveCardConfig = [
    { key: "sales", label: "Sales", iconKey: "sales", icon: "\u2630" },
    { key: "ordervalue", label: "Total Order Value", iconKey: "ordervalue", icon: "\u25A4" },
    { key: "aov", label: "Average Order Value (AOV)", iconKey: "aov", icon: "\u2197" },
    { key: "convrate", label: "Conversion Rate", iconKey: "convrate", icon: "\u26A1" },
    { key: "roi", label: "ROI", iconKey: "roi", icon: "\u21BB" }
  ];
  const topCards = executiveCardConfig
    .map((cfg) => {
      const card = metricCard(input.metricMap[cfg.key]);
      if (!card) return null;
      const hasIconPath = Boolean(cfg.iconKey && HAS_KPI_ICON[cfg.iconKey]);
      return {
        ...card,
        label: cfg.label,
        icon: cfg.icon,
        iconPath: hasIconPath ? KPI_ICON_PATHS[cfg.iconKey] : ""
      };
    })
    .filter(Boolean);
  const executiveNarrative = buildExecutiveSummaryText(input);
  const reportingSummary = `${input.reportingPeriod} vs ${input.comparisonPeriod}`;

  const volumeRows = buildMetricRows(input.metricMap, [
    ["clicks", "Clicks"],
    ["sales", "Sales (Transactions)"],
    ["convrate", "Conversion Rate"],
    ["aov", "Average Order Value (AOV)"],
    ["ordervalue", "Total Order Value"],
    ["publcommission", "Publisher Commission"],
    ["cpa", "Cost Per Acquisition (CPA)"],
    ["roi", "Return on Investment (ROI)"]
  ]);

  const segmentTable = input.tables.segmentSnapshot;
  const moversSales = input.tables.moversSales;
  const moversOrderValue = input.tables.moversOrderValue;
  const moversClicks = input.tables.moversClicks;
  const brandNew = input.tables.brandNewPublishers;
  const kpiAnalysisBullets = buildKpiAnalysisBullets(input);
  const publisherOverviewBullets = buildPublisherOverviewBullets(input);
  const segmentPerformanceBlocks = buildSegmentPerformanceBlocks(input);
  const salesGrowthSignals = buildSalesGrowthSignals(input);
  const programBreakdownTable = buildProgramBreakdownTable(input);

  slides.push({
    id: "cover",
    kind: "cover",
    title: `${input.client} Affiliate Program Quarterly Business Review`,
    subtitle: "",
    headline,
    summary: input.qbrFocusDetail
      ? `${input.qbrFocus}. ${input.qbrFocusDetail}`
      : `A comprehensive year-over-year analysis of the ${input.client} affiliate program's performance, publisher dynamics, and strategic priorities to drive growth and optimise outcomes.`,
    bullets: [`Client: ${input.client}`, `Reporting currency: ${input.currencyCode}`, `Language: ${input.languageName}`],
    kpis: [],
    tables: []
  });

  slides.push({
    id: "reporting-period",
    kind: "reporting-period",
    title: "Reporting Period",
    subtitle: "Current and YoY comparison windows",
    headline: "",
    summary: "",
    bullets: [
      `Current period: ${input.reportingPeriod}`,
      `Comparison period: ${input.comparisonPeriod}`,
      `Primary focus: ${input.qbrFocus}${input.qbrFocusDetail ? ` - ${input.qbrFocusDetail}` : ""}`
    ],
    kpis: [],
    tables: [],
    callout: `All figures are reported in ${input.currencyCode} unless otherwise stated. YoY variance is calculated as current period vs comparison period.`
  });

  slides.push({
    id: "executive-summary",
    kind: "program-executive-summary",
    title: "Program Performance: Executive Summary",
    headline: "",
    summary: executiveNarrative,
    bullets: [],
    kpis: topCards,
    tables: []
  });

  slides.push({
    id: "kpi-volume-conversion",
    kind: "kpi-table",
    title: "KPI Summary Table: Volume, Conversion, Cost & ROI",
    subtitle: "Unified KPI breakdown vs prior year.",
    bullets: [],
    kpis: [],
    tables: [
      {
        title: "KPI Summary",
        columns: ["Metric", "Current Period", "Prior Year", "Change", "% Variance"],
        rows: volumeRows.length ? volumeRows : [["-", "-", "-", "-", "-"]],
        dense: false
      }
    ],
    footerNote: "Conversion rate = Sales \u00F7 Clicks. AOV = Total Order Value \u00F7 Sales. ROI = Total Order Value \u00F7 Total Commission."
  });

  slides.push({
    id: "kpi-cost-roi",
    kind: "program-breakdown",
    title: "Program-Level Breakdown: Volume & Conversion",
    subtitle: "Per-program view for selected request scope.",
    bullets: [],
    kpis: [],
    tables: [programBreakdownTable]
  });

  slides.push({
    id: "kpi-highlights",
    kind: "insights-blue",
    title: "KPI Highlights & Business Implications",
    subtitle: "What the numbers mean for the business - key signals and context.",
    bullets: kpiAnalysisBullets,
    kpis: [],
    tables: []
  });

  slides.push({
    id: "publisher-overview",
    kind: "publisher-overview",
    title: "Publisher Performance Overview",
    subtitle: "High-level summary of publisher activity, segmentation and YoY movement.",
    bullets: publisherOverviewBullets.slice(0, 4),
    kpis: [],
    tables: segmentTable
      ? [
          {
            title: "Publisher Activity Summary",
            columns: segmentTable.columns,
            rows: segmentTable.rows.map((row) => segmentTable.columns.map((column) => row[column] || "-")),
            colW: [1.25, 1.15, 1.25, 1.2, 1.15, 0.9],
            colAlign: ["left", "right", "right", "right", "right", "right"],
            dense: false
          }
        ]
      : []
  });

  slides.push({
    id: "segment-performance",
    kind: "segment-performance-blue",
    title: "Publisher Segment Performance",
    subtitle: "",
    bullets: segmentPerformanceBlocks,
    kpis: [],
    tables: []
  });

  slides.push({
    id: "movers-shakers-sales",
    kind: "publisher-table",
    title: "Movers & Shakers: Sales",
    subtitle: "Largest YoY sales movers and decliners.",
    bullets: [],
    kpis: [],
    tables: [
      buildDirectionalMoversTable(moversSales, "Movers & Shakers - Sales", [
        "Publisher",
        "Site ID",
        "Current Sales",
        "YoY Change",
        "YoY %"
      ])
    ],
    callout: "Up = positive YoY movement; Down = negative YoY movement."
  });

  slides.push({
    id: "movers-shakers-ov",
    kind: "publisher-table",
    title: "Movers & Shakers: Order Value",
    subtitle: "Largest YoY order value movers and decliners.",
    bullets: [],
    kpis: [],
    tables: [
      buildDirectionalMoversTable(moversOrderValue, "Movers & Shakers - Order Value", [
        "Publisher",
        "Site ID",
        "Current OV",
        "YoY Change",
        "YoY %"
      ])
    ],
    callout: "Order value movers indicate where incremental revenue was won or lost YoY."
  });

  slides.push({
    id: "movers-shakers-clicks",
    kind: "publisher-table",
    title: "Movers & Shakers: Clicks",
    subtitle: "Largest YoY click movers and decliners.",
    bullets: [],
    kpis: [],
    tables: [
      buildDirectionalMoversTable(moversClicks, "Movers & Shakers - Clicks", [
        "Publisher",
        "Site ID",
        "Current Clicks",
        "YoY Change",
        "YoY %"
      ])
    ],
    callout: "Traffic movement helps explain volume and conversion shifts across the publisher mix."
  });

  slides.push({
    id: "brand-new-publishers",
    kind: "publisher-table",
    title: "Brand New Publishers",
    subtitle: "Publishers activated for the first time in the current period.",
    bullets: [],
    kpis: [],
    tables: [
      tableOrPlaceholder(brandNew, "Brand New Publishers", [
        "Publisher",
        "Segment",
        "Current Sales",
        "Current OV",
        "CPA"
      ])
    ],
    callout: "Brand-new publishers are not included in YoY comparisons until a prior-year baseline exists."
  });

  slides.push({
    id: "sales-growth-signals",
    kind: "sales-growth-signals-blue",
    title: "Sales Growth Signals",
    subtitle: `Factual observations from the data relevant to the programme's sales performance - ${input.reportingPeriod}.`,
    bullets: [],
    signals: salesGrowthSignals,
    kpis: [],
    tables: []
  });

  slides.push({
    id: "risks-dependencies",
    kind: "risks-dependencies",
    title: "Risks & Dependencies",
    subtitle: "Key risks to programme performance, external dependencies, and assigned action owners for the next review cycle.",
    bullets: [],
    kpis: [],
    tables: [
      {
        title: "Risks & Dependencies",
        columns: ["Risk", "Impact", "Mitigation"],
        colW: [2.8, 1.25, 8.45],
        rows: buildRiskRows(input),
        dense: false
      }
    ]
  });

  slides.push({
    id: "thank-you",
    kind: "thank-you",
    title: `${input.client} - Thank you.`,
    subtitle: "",
    bullets: [],
    kpis: [],
    tables: []
  });

  if (input.includeAppendix && input.metrics.length) {
    slides.push({
      id: "appendix-program-yoy",
      kind: "appendix",
      title: "Appendix: Program YoY Table",
      bullets: [],
      kpis: [],
      tables: [
        {
          title: "Program YoY Table",
          columns: ["Metric", "Current", "Previous", "Difference", "Variance"],
          rows: input.metrics.map((metric) => [
            metric.label,
            metric.current || "-",
            metric.previous || "-",
            metric.difference || "-",
            metric.variance || "-"
          ]),
          dense: true
        }
      ]
    });
  }

  return {
    metadata: {
      requestId: input.requestId,
      client: input.client,
      deckTitle: input.deckTitle,
      reportingPeriod: input.reportingPeriod,
      comparisonPeriod: input.comparisonPeriod,
      languageCode: input.languageCode,
      languageName: input.languageName,
      locale: input.locale || "en-GB",
      uiLabels: uiLabelsForLanguage(input.languageCode),
      currencyCode: input.currencyCode,
      qbrFocus: input.qbrFocus,
      analysisProgramIds: Array.isArray(input.analysisProgramIds) ? input.analysisProgramIds : [],
      generatedAt: new Date().toISOString()
    },
    theme,
    slides
  };
}

function toColor(hex) {
  return String(hex || "#000000").replace(/^#/, "");
}

function isBlueKind(kind) {
  return ["cover", "insights-blue", "sales-growth-signals-blue", "recommendations-blue", "segment-performance-blue", "thank-you"].includes(kind);
}

function titleRuns(title) {
  const text = cleanInlineText(title);
  if (!text) return [{ text: "Slide Title", options: {} }];
  const phrases = [
    "Growth Publishers",
    "Decline Publishers",
    "Current Performers",
    "Segment Performance",
    "Strategic Recommendations",
    "Risks & Dependencies",
    "Reporting Period",
    "Priority Actions",
    "Performance Overview",
    "Business Implications",
    "Publishers",
    "Overview",
    "Actions",
    "Period"
  ];

  const lower = text.toLowerCase();
  const phrase = phrases.find((candidate) => lower.includes(candidate.toLowerCase()));
  if (!phrase) return [{ text, options: {} }];

  const idx = lower.indexOf(phrase.toLowerCase());
  const before = text.slice(0, idx);
  const middle = text.slice(idx, idx + phrase.length);
  const after = text.slice(idx + phrase.length);

  const runs = [];
  if (before) runs.push({ text: before, options: {} });
  runs.push({ text: middle, options: { color: toColor(DEFAULT_THEME.colors.accent) } });
  if (after) runs.push({ text: after, options: {} });
  return runs;
}

function addDotPattern(slide, x, y, color, transparency = 35) {
  const cols = 9;
  const rows = 7;
  const size = 0.025;
  const gap = 0.11;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      slide.addShape("ellipse", {
        x: x + col * gap,
        y: y + row * gap,
        w: size,
        h: size,
        line: { color: toColor(color), pt: 0 },
        fill: { color: toColor(color), transparency }
      });
    }
  }
}

function drawPolyline(slide, points, color, lineTransparency = 72, pt = 0.9) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    slide.addShape("line", {
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
      line: { color: toColor(color), pt, transparency: lineTransparency }
    });
  }
}

function addWireframeWatermark(slide, color, lineTransparency = 72) {
  const loops = [
    [[9.55, 0.2], [10.55, 0.0], [11.5, 0.22], [11.95, 1.0], [11.5, 1.76], [10.56, 1.92], [9.78, 1.35], [9.55, 0.2]],
    [[10.72, 0.54], [11.62, 0.7], [12.12, 1.34], [11.86, 2.08], [11.08, 2.28], [10.38, 1.84], [10.25, 1.08], [10.72, 0.54]],
    [[10.06, 1.86], [10.9, 2.04], [11.3, 2.78], [10.96, 3.52], [10.2, 3.7], [9.46, 3.24], [9.32, 2.48], [10.06, 1.86]],
    [[11.36, 2.32], [12.12, 2.58], [12.56, 3.3], [12.28, 4.02], [11.55, 4.28], [10.98, 3.92], [10.88, 3.16], [11.36, 2.32]],
    [[9.86, 3.5], [10.45, 3.78], [10.7, 4.44], [10.28, 5.03], [9.68, 5.12], [9.22, 4.7], [9.2, 4.08], [9.86, 3.5]]
  ];

  loops.forEach((loop) => drawPolyline(slide, loop, color, lineTransparency, 0.9));

  const links = [
    [[10.55, 0.0], [11.62, 0.7]],
    [[10.56, 1.92], [10.9, 2.04]],
    [[11.08, 2.28], [11.36, 2.32]],
    [[10.96, 3.52], [10.7, 4.44]],
    [[11.55, 4.28], [10.7, 4.44]],
    [[9.55, 0.2], [10.06, 1.86]],
    [[11.95, 1.0], [12.12, 2.58]],
    [[9.78, 1.35], [9.2, 4.08]]
  ];

  links.forEach((segment) => drawPolyline(slide, segment, color, lineTransparency + 7, 0.7));
}

function addSlideWatermark(slide, deck, isBlueSlide) {
  if ((isBlueSlide && HAS_TEMPLATE_BLUE_BG) || (!isBlueSlide && HAS_TEMPLATE_LIGHT_BG)) {
    return;
  }
  const watermarkColor = isBlueSlide ? deck.theme.colors.paper : deck.theme.colors.accent;
  addWireframeWatermark(slide, watermarkColor, isBlueSlide ? 70 : 82);
  addDotPattern(slide, 0.08, 6.2, watermarkColor, isBlueSlide ? 42 : 62);
}

function addTemplateBackgroundImage(slide, imagePath) {
  slide.addImage({
    path: imagePath,
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5
  });
}

function addLightChrome(slide, deck) {
  slide.background = { color: toColor(deck.theme.colors.paper) };
  if (HAS_TEMPLATE_LIGHT_BG) {
    addTemplateBackgroundImage(slide, TEMPLATE_LIGHT_BG_PATH);
  }
}

function addBlueChrome(slide, deck) {
  slide.background = { color: toColor(deck.theme.colors.accent) };
  if (HAS_TEMPLATE_BLUE_BG) {
    addTemplateBackgroundImage(slide, TEMPLATE_BLUE_BG_PATH);
  }
}

function addTitle(slide, deck, spec, color, subtitleColor, isBlueSlide = false) {
  const titleText = cleanInlineText(spec.title, "Slide Title");
  const titleRunsData = isBlueSlide ? [{ text: titleText, options: {} }] : titleRuns(titleText);

  slide.addText(titleRunsData, {
    x: 0.7,
    y: 0.58,
    w: 11.8,
    h: 0.62,
    fontFace: deck.theme.fonts.heading,
    fontSize: 28,
    color: toColor(color),
    margin: 0
  });
  if (spec.subtitle) {
    slide.addText(spec.subtitle, {
      x: 0.7,
      y: 1.44,
      w: 12.0,
      h: 0.34,
      fontFace: deck.theme.fonts.body,
      fontSize: 11,
      color: toColor(subtitleColor),
      margin: 0
    });
  }
  addSlideWatermark(slide, deck, isBlueSlide);
}

function addBullets(slide, deck, bullets, box, color) {
  if (!bullets || !bullets.length) return;
  slide.addText(bullets.map((item) => `\u2022 ${item}`).join("\n"), {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fontFace: deck.theme.fonts.body,
    fontSize: 12,
    color: toColor(color || deck.theme.colors.ink),
    breakLine: true,
    margin: 0.06
  });
}

function isTableValueNumeric(value) {
  const text = cleanInlineText(value || "");
  if (!text || text === "-" || /^n\/a$/i.test(text)) return false;
  const normalized = text
    .replace(/[Â£$â‚¬,\s]/g, "")
    .replace(/%$/, "")
    .replace(/^\+/, "");
  return /^-?\d+(\.\d+)?$/.test(normalized);
}

function inferTableColumnAlign(table, columnIndex, columnName) {
  if (columnIndex === 0) return "left";
  const explicitAlign = Array.isArray(table.colAlign) && table.colAlign.length === table.columns.length
    ? table.colAlign[columnIndex]
    : null;
  if (explicitAlign === "left" || explicitAlign === "center" || explicitAlign === "right") {
    return explicitAlign;
  }

  const numericHeaderPattern = /sales|clicks?|impressions?|ov|order value|commission|cost|cpa|roi|aov|rate|variance|change|yoy|publishers?|count|rank|id|current|prior|previous|total/i;
  const sampleValues = (table.rows || [])
    .slice(0, 8)
    .map((row) => row[columnIndex]);
  const numericCount = sampleValues.filter(isTableValueNumeric).length;

  if (sampleValues.length && numericCount >= Math.ceil(sampleValues.length * 0.5)) return "right";
  if (numericHeaderPattern.test(cleanInlineText(columnName || ""))) return "right";
  return "left";
}

function addCallout(slide, deck, text, y, darkText = true) {
  if (!text) return;
  slide.addShape("roundRect", {
    x: 0.7,
    y,
    w: 11.95,
    h: 0.92,
    radius: 0.04,
    line: { color: toColor(deck.theme.colors.highlight), pt: 0.5 },
    fill: { color: toColor(deck.theme.colors.highlight), transparency: 12 }
  });
  slide.addText(`\u25AD  ${text}`, {
    x: 0.95,
    y: y + 0.19,
    w: 11.4,
    h: 0.55,
    fontFace: deck.theme.fonts.body,
    fontSize: 10.5,
    color: toColor(darkText ? deck.theme.colors.ink : deck.theme.colors.paper),
    breakLine: true,
    margin: 0
  });
}

function addKpis(slide, deck, cards, origin, mode = "light") {
  const visible = (cards || []).slice(0, 5);
  if (!visible.length) return;
  const columns = 3;
  const cardW = 3.82;
  const cardH = 1.48;
  const gapX = 0.24;
  const gapY = 0.48;
  visible.forEach((card, index) => {
    const useDiamond = mode === "diamond" && visible.length === 5;
    let x;
    let y;
    if (useDiamond && index >= 3) {
      x = origin.x + ((index - 3) * (cardW + gapX)) + ((cardW + gapX) / 2);
      y = origin.y + cardH + gapY;
    } else {
      const col = index % columns;
      const row = Math.floor(index / columns);
      x = origin.x + col * (cardW + gapX);
      y = origin.y + row * (cardH + gapY);
    }
    const trendColor = card.trend === "up"
      ? deck.theme.colors.success
      : card.trend === "down"
        ? deck.theme.colors.accentAlt
        : deck.theme.colors.muted;

    slide.addShape("rect", {
      x,
      y,
      w: cardW,
      h: cardH,
      line: { color: toColor(deck.theme.colors.border), pt: 0.7 },
      fill: { color: toColor(deck.theme.colors.paper), transparency: (mode === "blue" || mode === "diamond-blue") ? 6 : 0 }
    });
    slide.addShape("rect", {
      x,
      y,
      w: cardW,
      h: 0.08,
      line: { color: toColor(deck.theme.colors.accent), pt: 0 },
      fill: { color: toColor(deck.theme.colors.accent) }
    });
    slide.addShape("ellipse", {
      x: x + (cardW / 2) - 0.27,
      y: y - 0.27,
      w: 0.54,
      h: 0.54,
      line: { color: toColor(deck.theme.colors.accent), pt: 0 },
      fill: { color: toColor(deck.theme.colors.accent) }
    });
    if (card.iconPath) {
      slide.addImage({
        path: card.iconPath,
        x: x + (cardW / 2) - 0.11,
        y: y - 0.12,
        w: 0.22,
        h: 0.22
      });
    } else {
      slide.addText(card.icon || String(index + 1), {
        x: x + (cardW / 2) - 0.13,
        y: y - 0.13,
        w: 0.26,
        h: 0.24,
        align: "center",
        valign: "mid",
        fontFace: "Segoe UI Symbol",
        fontSize: 12,
        bold: false,
        color: toColor(deck.theme.colors.paper),
        margin: 0
      });
    }
    slide.addText(card.label, {
      x: x + 0.22,
      y: y + 0.50,
      w: cardW - 0.3,
      h: 0.24,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.5,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    const summary = cleanInlineText(card.summary || card.value || "-");
    const delta = cleanInlineText(card.delta || "");
    const hasDelta = delta && summary.includes(delta);
    const baseText = hasDelta ? summary.slice(0, summary.lastIndexOf(delta)).trimEnd() : summary;
    const runs = hasDelta
      ? [
          { text: baseText ? `${baseText} ` : "", options: { color: toColor(deck.theme.colors.ink) } },
          { text: delta, options: { color: toColor(trendColor) } }
        ]
      : [{ text: summary, options: { color: toColor(deck.theme.colors.ink) } }];
    slide.addText(runs, {
      x: x + 0.22,
      y: y + 0.86,
      w: cardW - 0.35,
      h: 0.52,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.2,
      margin: 0,
      breakLine: true
    });
  });
}

function isDeltaColumn(header) {
  const lower = cleanInlineText(header).toLowerCase();
  return lower.includes("change") || lower.includes("variance") || lower.includes("yoy") || lower.includes("trend");
}

function isVarianceRow(table, row) {
  if (!Array.isArray(row) || !row.length) return false;

  const values = row.map((value) => cleanInlineText(value || "").toLowerCase());
  if (values.some((value) => value.includes("variance"))) return true;

  const firstHeader = cleanInlineText((table.columns && table.columns[0]) || "").toLowerCase();
  const firstValue = values[0] || "";
  return (firstHeader === "period" || firstHeader === "row" || firstHeader === "metric") && firstValue.includes("variance");
}

function metricToneFromVarianceHints(table, column) {
  const map = table && table.varianceColorMap && typeof table.varianceColorMap === "object"
    ? table.varianceColorMap
    : null;
  if (!map) return "";
  const key = cleanInlineText(column || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key ? cleanInlineText(map[key] || "").toLowerCase() : "";
}

function cellTextColor(table, column, value, deck, row = [], cellIndex = 0) {
  const varianceRow = isVarianceRow(table, row);
  const labelCell = cleanInlineText(value || "").toLowerCase().includes("variance");
  const useDeltaColor = isDeltaColumn(column) || (varianceRow && !labelCell);
  if (!useDeltaColor) return toColor(deck.theme.colors.ink);

  const hintedTone = metricToneFromVarianceHints(table, column);
  if (hintedTone.startsWith("pos")) return toColor(deck.theme.colors.success);
  if (hintedTone.startsWith("neg")) return toColor(deck.theme.colors.accentAlt);
  if (hintedTone.startsWith("neu") || hintedTone === "na") return toColor(deck.theme.colors.ink);

  const text = cleanInlineText(value);
  if (text.startsWith("+") || text.startsWith("â–²")) return toColor(deck.theme.colors.success);
  if (text.startsWith("-") || text.startsWith("â–¼")) return toColor(deck.theme.colors.accentAlt);
  const numeric = parseNumber(text);
  if (Number.isFinite(numeric) && numeric > 0) return toColor(deck.theme.colors.success);
  if (Number.isFinite(numeric) && numeric < 0) return toColor(deck.theme.colors.accentAlt);
  return toColor(deck.theme.colors.ink);
}

function addTable(slide, deck, table, box, mode = "light") {
  const innerX = box.x + 0.12;
  const innerY = box.y + 0.10;
  const innerW = box.w - 0.24;
  const innerH = box.h - 0.20;
  const columnAlignments = table.columns.map((column, index) => inferTableColumnAlign(table, index, column));

  const header = table.columns.map((column, columnIndex) => ({
    text: column,
    options: {
      bold: true,
      fontFace: deck.theme.fonts.body,
      fontSize: table.dense ? 9 : 10.5,
      color: toColor(deck.theme.colors.ink),
      fill: { color: toColor("#F1F3F7") },
      margin: 0.045,
      align: columnAlignments[columnIndex] || "left",
      valign: "mid"
    }
  }));
  const bodyRows = table.rows.map((row, index) => {
    const firstCell = cleanInlineText(row[0] || "");
    const isSectionRow = /^Top\s+\d+\s+(Up|Down)$/i.test(firstCell);
    const rowFill = isSectionRow
      ? "#E5E8EF"
      : index % 2 === 0
        ? "#F4F5F7"
        : "#ECEDEF";

    const varianceRowLocal = row
      .map((value) => cleanInlineText(value || "").toLowerCase())
      .some((value) => value.includes("variance"));

    return row.map((value, cellIndex) => {
      const valueText = cleanInlineText(value || "");
      const labelCell = valueText.toLowerCase().includes("variance");

      let textColor = isSectionRow
        ? toColor(deck.theme.colors.ink)
        : cellTextColor(table, table.columns[cellIndex] || "", value, deck, row, cellIndex);

      if (!isSectionRow && varianceRowLocal && !labelCell) {
        if (valueText.startsWith("+") || valueText.startsWith("â–²") || parseNumber(valueText) > 0) {
          textColor = toColor(deck.theme.colors.success);
        } else if (valueText.startsWith("-") || valueText.startsWith("â–¼") || parseNumber(valueText) < 0) {
          textColor = toColor(deck.theme.colors.accentAlt);
        } else {
          textColor = toColor(deck.theme.colors.ink);
        }
      }

      return {
        text: value,
        options: {
          bold: isSectionRow,
          fontFace: deck.theme.fonts.body,
          fontSize: table.dense ? 9 : (isSectionRow ? 10.5 : 10),
          color: textColor,
          fill: { color: toColor(rowFill) },
          margin: 0.045,
          align: columnAlignments[cellIndex] || "left",
          valign: "mid"
        }
      };
    });
  });

  let headerH = table.dense ? 0.34 : 0.58;
  let bodyH = table.dense ? 0.30 : 0.58;
  const bodyCount = bodyRows.length;
  const headerWeight = table.dense ? 1.08 : 1.16;
  const fittedBody = innerH / Math.max(1, (bodyCount + headerWeight));
  if (Number.isFinite(fittedBody) && fittedBody > 0) {
    bodyH = Number(Math.min(table.dense ? 0.46 : 0.72, Math.max(table.dense ? 0.22 : 0.30, fittedBody)).toFixed(3));
    headerH = Number((bodyH * headerWeight).toFixed(3));
  }
  const desiredTableH = headerH + (bodyCount * bodyH);
  if (desiredTableH > innerH && desiredTableH > 0) {
    const scale = innerH / desiredTableH;
    headerH = Math.max(0.24, Number((headerH * scale).toFixed(3)));
    bodyH = Math.max(0.22, Number((bodyH * scale).toFixed(3)));
  }

  const effectiveTableH = Number((headerH + (bodyCount * bodyH)).toFixed(3));
  const containerH = Math.min(box.h, Number((effectiveTableH + 0.16).toFixed(3)));
  const rowHeights = [headerH, ...Array.from({ length: bodyCount }, () => bodyH)];
  let colW;
  if (Array.isArray(table.colW) && table.colW.length === table.columns.length) {
    const numeric = table.colW.map((w) => Number(w)).filter((w) => Number.isFinite(w) && w > 0);
    if (numeric.length === table.columns.length) {
      const total = numeric.reduce((sum, w) => sum + w, 0);
      if (total > 0) {
        colW = numeric.map((w) => Number(((w / total) * innerW).toFixed(3)));
      }
    }
  }

  slide.addShape("rect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: containerH,
    line: { color: toColor("#D6DAE3"), pt: 0.7 },
    fill: { color: toColor(deck.theme.colors.paper) }
  });

  slide.addTable([header, ...bodyRows], {
    x: innerX,
    y: innerY,
    w: innerW,
    h: effectiveTableH,
    colW,
    rowH: rowHeights,
    border: { type: "solid", color: toColor("#E3E6EC"), pt: 0.3 },
    margin: 0.02,
    autoFit: false
  });

  return { containerH, tableH: effectiveTableH };
}

function renderSlide(slide, deck, spec, pageNumber) {
  if (spec.kind === "cover") {
    addBlueChrome(slide, deck);
    addSlideWatermark(slide, deck, true);
    const locale = deck.metadata.locale || "en-GB";
    const periodTag = parsePeriodRange(deck.metadata.reportingPeriod, locale);
    const coverTitle = cleanInlineText(spec.title || `${deck.metadata.client} Quarterly Business Review`);
    const match = coverTitle.match(/^(.*?)(business review)$/i);
    const titleRunsData = match
      ? [
          { text: `${match[1]}`, options: { color: toColor(deck.theme.colors.paper) } },
          { text: `${match[2]}`, options: { color: toColor(deck.theme.colors.ink) } }
        ]
      : [{ text: coverTitle, options: { color: toColor(deck.theme.colors.paper) } }];
    slide.addText(titleRunsData, {
      x: 0.68,
      y: 0.68,
      w: 11.55,
      h: 1.22,
      fontFace: deck.theme.fonts.heading,
      fontSize: 29,
      breakLine: true,
      margin: 0
    });
    const coverSummary = cleanInlineText(
      spec.summary
        || "A comprehensive year-over-year analysis of programme performance, publisher dynamics and strategic priorities."
    );
    slide.addText(coverSummary, {
      x: 0.68,
      y: 2.0,
      w: 11.35,
      h: 0.78,
      fontFace: deck.theme.fonts.body,
      fontSize: 12.2,
      color: toColor(deck.theme.colors.paper),
      breakLine: true,
      margin: 0
    });
    slide.addShape("roundRect", {
      x: 0.68,
      y: 3.0,
      w: 1.28,
      h: 0.36,
      radius: 0.04,
      line: { color: toColor(deck.theme.colors.paper), pt: 0 },
      fill: { color: toColor(deck.theme.colors.paper), transparency: 25 }
    });
    slide.addText(uiLabel(deck, "qbrReport", "QBR Report"), {
      x: 0.83,
      y: 3.08,
      w: 1.0,
      h: 0.2,
      fontFace: deck.theme.fonts.body,
      fontSize: 8.5,
      color: toColor(deck.theme.colors.ink),
      bold: true,
      margin: 0
    });
    slide.addShape("roundRect", {
      x: 2.06,
      y: 3.0,
      w: 2.65,
      h: 0.36,
      radius: 0.04,
      line: { color: toColor(deck.theme.colors.accent), pt: 0.8 },
      fill: { color: toColor(deck.theme.colors.accent), transparency: 100 }
    });
    slide.addText(`${periodTag} ${uiLabel(deck, "analysisTagSuffix", "Analysis")}`.trim(), {
      x: 2.18,
      y: 3.08,
      w: 3.2,
      h: 0.2,
      fontFace: deck.theme.fonts.body,
      fontSize: 8.5,
      color: toColor("#80D4FF"),
      bold: true,
      margin: 0
    });
    slide.addText("td", {
      x: 0.62,
      y: 4.22,
      w: 2.15,
      h: 1.72,
      fontFace: deck.theme.fonts.heading,
      fontSize: 118,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    slide.addText("tradedoubler", {
      x: 0.76,
      y: 6.43,
      w: 2.5,
      h: 0.24,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.2,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    return;
  }

  if (spec.kind === "thank-you") {
    addBlueChrome(slide, deck);
    addSlideWatermark(slide, deck, true);
    slide.addText(spec.title, {
      x: 0.7,
      y: 1.45,
      w: 10.8,
      h: 0.62,
      fontFace: deck.theme.fonts.heading,
      fontSize: 25,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    slide.addShape("roundRect", {
      x: 0.62,
      y: 2.55,
      w: 12.05,
      h: 1.12,
      radius: 0.06,
      line: { color: toColor(deck.theme.colors.paper), pt: 0.35, transparency: 55 },
      fill: { color: toColor(deck.theme.colors.paper), transparency: 42 }
    });
    slide.addText(uiLabel(deck, "anyQuestions", "Any Questions?"), {
      x: 0.95,
      y: 2.84,
      w: 10.6,
      h: 0.35,
      fontFace: deck.theme.fonts.heading,
      fontSize: 17.5,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    const thankYouSubtitleTemplate = uiLabel(
      deck,
      "thankYouSubtitleTemplate",
      "TD Affiliate Program - {period} Quarterly Business Review"
    );
    const thankYouSubtitle = thankYouSubtitleTemplate.includes("{period}")
      ? thankYouSubtitleTemplate.replace("{period}", deck.metadata.reportingPeriod)
      : `${thankYouSubtitleTemplate} ${deck.metadata.reportingPeriod}`;
    slide.addText(thankYouSubtitle, {
      x: 0.95,
      y: 3.17,
      w: 10.8,
      h: 0.24,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.2,
      color: toColor(deck.theme.colors.paper),
      transparency: 15,
      margin: 0
    });
    return;
  }

  if (isBlueKind(spec.kind)) {
    addBlueChrome(slide, deck);
    addTitle(slide, deck, spec, deck.theme.colors.paper, deck.theme.colors.paper, true);
  } else {
    addLightChrome(slide, deck);
    addTitle(slide, deck, spec, deck.theme.colors.ink, deck.theme.colors.accent, false);
  }

  if (spec.kind === "reporting-period") {
    const locale = deck.metadata.locale || "en-GB";
    const currentPeriodReadable = formatPeriodForSlide(deck.metadata.reportingPeriod, locale);
    const comparisonPeriodReadable = formatPeriodForSlide(deck.metadata.comparisonPeriod, locale);
    const currentPeriodParsed = parseIsoPeriod(deck.metadata.reportingPeriod);
    const asOfLabel = currentPeriodParsed ? formatLongDate(currentPeriodParsed.end, locale) : "N/A";
    const currencySymbol = getCurrencySymbol(deck.metadata.currencyCode);
    const currencyLabel = currencySymbol
      ? `${deck.metadata.currencyCode} (${currencySymbol})`
      : deck.metadata.currencyCode;
    const allFiguresStatement = uiLabel(
      deck,
      "allFiguresStatement",
      "All figures are reported in {currency} unless otherwise stated. YoY variance is calculated as Current Period vs Comparison Period."
    ).replace("{currency}", currencyLabel);

    slide.addText(uiLabel(deck, "currentPeriod", "Current Period"), {
      x: 0.7,
      y: 2.0,
      w: 5.6,
      h: 0.4,
      fontFace: deck.theme.fonts.heading,
      fontSize: 21,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addText(uiLabel(deck, "comparisonPeriodYoy", "Comparison Period (YoY)"), {
      x: 6.9,
      y: 2.0,
      w: 5.6,
      h: 0.4,
      fontFace: deck.theme.fonts.heading,
      fontSize: 21,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addText(`${uiLabel(deck, "reportingPeriodPrefix", "Reporting Period")}: ${currentPeriodReadable}`, {
      x: 0.7,
      y: 2.55,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText(`${uiLabel(deck, "dataAsOfPrefix", "Data as of")}: ${asOfLabel}`, {
      x: 0.7,
      y: 2.86,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText(`${uiLabel(deck, "comparisonPeriodPrefix", "Comparison Period")}: ${comparisonPeriodReadable}`, {
      x: 6.9,
      y: 2.55,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText(uiLabel(deck, "basisYoy", "Basis: Year-over-Year (YoY)"), {
      x: 6.9,
      y: 2.86,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addShape("roundRect", {
      x: 0.7,
      y: 3.55,
      w: 11.95,
      h: 1.05,
      radius: 0.05,
      line: { color: toColor(deck.theme.colors.highlight), pt: 0.5 },
      fill: { color: toColor(deck.theme.colors.highlight), transparency: 10 }
    });
    slide.addText(`\u25AD  ${allFiguresStatement}`, {
      x: 0.95,
      y: 3.9,
      w: 11.35,
      h: 0.48,
      fontFace: deck.theme.fonts.body,
      fontSize: 11.4,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    return;
  }

  if (spec.kind === "program-executive-summary") {
    addKpis(slide, deck, spec.kpis, { x: 0.7, y: 2.15 }, "diamond");
    if (spec.summary) {
      slide.addText(spec.summary, {
        x: 0.82,
        y: 5.87,
        w: 11.6,
        h: 0.9,
        fontFace: deck.theme.fonts.body,
        fontSize: 11.3,
        color: toColor(deck.theme.colors.ink),
        breakLine: true,
        margin: 0
      });
    }
    return;
  }

  if (spec.kind === "insights-blue") {
    const insightItems = (spec.bullets || []).slice(0, 10);
    const items = insightItems.length
      ? insightItems
      : [uiLabel(deck, "kpiDriverUnavailable", "Driver not confirmed from available KPI data.")];

    const localizeKpiTitle = (title) => {
      const t = cleanInlineText(title || "").toLowerCase();
      if (/^conversion rate improvement$/.test(t)) return uiLabel(deck, "kpiTitleConversionRateImprovement", "Conversion Rate Improvement");
      if (/^sales volume pressure$/.test(t)) return uiLabel(deck, "kpiTitleSalesVolumePressure", "Sales Volume Pressure");
      if (/^aov growth partially offsetting volume decline$/.test(t)) return uiLabel(deck, "kpiTitleAovGrowthOffset", "AOV Growth Partially Offsetting Volume Decline");
      if (/^rising cpa$/.test(t)) return uiLabel(deck, "kpiTitleRisingCpa", "Rising CPA");
      if (/^(roi trend|trend roi)$/.test(t)) return uiLabel(deck, "kpiTitleRoiTrend", "ROI Trend");
      return cleanInlineText(title || "");
    };

    const inferKpiSignalTitle = (text) => {
      const t = cleanInlineText(text).toLowerCase();
      if (/(conv rate|conversion rate)/.test(t)) return uiLabel(deck, "kpiTitleConversionRateImprovement", "Conversion Rate Improvement");
      if (/(click|sales)/.test(t)) return uiLabel(deck, "kpiTitleSalesVolumePressure", "Sales Volume Pressure");
      if (/(aov|average order value|order value)/.test(t)) return uiLabel(deck, "kpiTitleAovGrowthOffset", "AOV Growth Partially Offsetting Volume Decline");
      if (/\bcpa\b|cost per acquisition|commission/.test(t)) return uiLabel(deck, "kpiTitleRisingCpa", "Rising CPA");
      if (/\broi\b|return on investment/.test(t)) return uiLabel(deck, "kpiTitleRoiTrend", "ROI Trend");
      return uiLabel(deck, "kpiSignalGeneric", "KPI Signal");
    };

    const parsed = items.map((raw) => {
      const text = cleanInlineText(raw);
      const idx = text.indexOf(":");
      if (idx > 8 && idx < 68) {
        return {
          title: localizeKpiTitle(text.slice(0, idx).trim()),
          detail: text.slice(idx + 1).trim() || uiLabel(deck, "kpiDetailUnavailable", "Detail not available from current extract.")
        };
      }
      return {
        title: inferKpiSignalTitle(text),
        detail: text
      };
    });

    const detailChars = parsed.reduce((sum, item) => sum + item.detail.length, 0);
    const titleSize = detailChars > 1800 ? 11.1 : detailChars > 1300 ? 11.6 : 12.2;
    const detailSize = detailChars > 1800 ? 9.0 : detailChars > 1300 ? 9.5 : 10.0;

    let y = 1.62;
    parsed.forEach((item) => {
      const detailLength = item.detail.length;
      const blockH = detailLength > 260 ? 0.98 : detailLength > 190 ? 0.84 : 0.72;
      if (y + blockH > 6.95) return;
      slide.addText(`\u2022 ${item.title}`, {
        x: 0.80,
        y,
        w: 12.0,
        h: 0.24,
        align: "left",
        valign: "top",
        fontFace: deck.theme.fonts.heading,
        fontSize: titleSize,
        color: toColor(deck.theme.colors.paper),
        bold: true,
        margin: 0
      });
      slide.addText(item.detail, {
        x: 1.05,
        y: y + 0.24,
        w: 11.65,
        h: blockH - 0.12,
        align: "left",
        valign: "top",
        fontFace: deck.theme.fonts.body,
        fontSize: detailSize,
        color: toColor(deck.theme.colors.paper),
        breakLine: true,
        margin: 0
      });
      y += blockH + 0.045;
    });
    return;
  }

  if (spec.kind === "sales-growth-signals-blue") {
    const signals = Array.isArray(spec.signals) && spec.signals.length
      ? spec.signals.slice(0, 5)
      : [{ title: "Signal", detail: "No sales growth signal available from the current data extract." }];
    signals.forEach((signal, index) => {
      const y = 1.88 + index * 1.08;
      slide.addShape("roundRect", {
        x: 0.72,
        y: y + 0.06,
        w: 0.34,
        h: 0.34,
        radius: 0.05,
        line: { color: toColor(deck.theme.colors.paper), pt: 0 },
        fill: { color: toColor(deck.theme.colors.paper), transparency: 22 }
      });
      slide.addText(String(index + 1), {
        x: 0.84,
        y: y + 0.14,
        w: 0.10,
        h: 0.18,
        fontFace: deck.theme.fonts.heading,
        fontSize: 11,
        bold: true,
        align: "center",
        color: toColor(deck.theme.colors.ink),
        margin: 0
      });
      slide.addText(cleanInlineText(signal.title || `Signal ${index + 1}`), {
        x: 1.18,
        y,
        w: 11.4,
        h: 0.34,
        fontFace: deck.theme.fonts.heading,
        fontSize: 16,
        color: toColor(deck.theme.colors.paper),
        margin: 0
      });
      slide.addText(cleanInlineText(signal.detail || "Detail not available."), {
        x: 1.18,
        y: y + 0.34,
        w: 11.45,
        h: 0.70,
        fontFace: deck.theme.fonts.body,
        fontSize: 10.8,
        color: toColor(deck.theme.colors.paper),
        breakLine: true,
        margin: 0
      });
    });
    return;
  }

  if (spec.kind === "priority-actions") {
    const actions = (spec.bullets || []).slice(0, 3);
    const cardW = 3.82;
    const y = 2.55;
    [0, 1, 2].forEach((index) => {
      const x = 0.7 + (index * 4.08);
      slide.addShape("roundRect", {
        x,
        y,
        w: cardW,
        h: 3.05,
        radius: 0.04,
        line: { color: toColor(deck.theme.colors.border), pt: 0.7 },
        fill: { color: toColor(deck.theme.colors.paper) }
      });
      slide.addShape("rect", {
        x,
        y,
        w: cardW,
        h: 0.62,
        line: { color: toColor(deck.theme.colors.highlight), pt: 0 },
        fill: { color: toColor(deck.theme.colors.highlight) }
      });
      slide.addText(String(index + 1), {
        x: x + (cardW / 2) - 0.12,
        y: y + 0.12,
        w: 0.24,
        h: 0.26,
        align: "center",
        fontFace: deck.theme.fonts.heading,
        fontSize: 20,
        color: toColor(deck.theme.colors.ink),
        margin: 0
      });
      slide.addText(actions[index] || "Action to be confirmed from available data.", {
        x: x + 0.22,
        y: y + 0.9,
        w: cardW - 0.4,
        h: 2.0,
        fontFace: deck.theme.fonts.body,
        fontSize: 12,
        color: toColor(deck.theme.colors.ink),
        breakLine: true,
        margin: 0
      });
    });
    return;
  }

  if (spec.kind === "publisher-overview") {
    let overviewTableMetrics = null;
    slide.addText(uiLabel(deck, "publisherActivityBySegment", "Publisher Activity by Segment"), {
      x: 0.35,
      y: 2.04,
      w: 5.6,
      h: 0.32,
      fontFace: deck.theme.fonts.body,
      fontSize: 12.5,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    if (spec.tables && spec.tables[0]) {
      overviewTableMetrics = addTable(slide, deck, spec.tables[0], { x: 0.35, y: 2.38, w: 5.55, h: 4.32 });
    }
    const points = (spec.bullets || []).slice(0, 4);
    slide.addText(uiLabel(deck, "keyObservations", "Key Observations"), {
      x: 6.25,
      y: 2.04,
      w: 5.6,
      h: 0.35,
      fontFace: deck.theme.fonts.heading,
      fontSize: 15,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    const notes = points.length ? points : ["Driver not confirmed from available data."];
    const observationRuns = [];
    notes.forEach((item, index) => {
      observationRuns.push({ text: `\u2022 ${item}`, options: { breakLine: true } });
      if (index < notes.length - 1) {
        observationRuns.push({ text: " ", options: { breakLine: true } });
      }
    });
    slide.addText(observationRuns, {
      x: 6.26,
      y: 2.56,
      w: 5.22,
      h: 4.74,
      fontFace: deck.theme.fonts.body,
      fontSize: 11.4,
      color: toColor(deck.theme.colors.ink),
      breakLine: true,
      margin: 0.02,
      valign: "top"
    });
    if (overviewTableMetrics && overviewTableMetrics.containerH < 4.32) {
      slide.addShape("line", {
        x: 0.35,
        y: 2.38 + overviewTableMetrics.containerH + 0.1,
        w: 5.55,
        h: 0,
        line: { color: toColor("#E6EAF2"), pt: 0.6 }
      });
    }
    return;
  }

  if (spec.kind === "segment-performance-blue" || spec.kind === "segment-performance") {
    const blocks = (spec.bullets || []).slice(0, 5);
    const segmentTileRadiusIn = Number((4 / 96).toFixed(4)); // 4px at 96 DPI
    const segmentSignalUnavailable = uiLabel(deck, "segmentSignalUnavailable", "Segment signal not available.");
    const detailedMovementUnavailable = uiLabel(deck, "detailedMovementUnavailable", "Detailed movement not available from this extract.");
    const clampText = (value, maxChars = 9999) => {
      const text = cleanInlineText(value || "");
      if (!text || text.length <= maxChars) return text;
      return `${text.slice(0, maxChars - 1).trimEnd()}â€¦`;
    };
    // Use larger tiles and full-width bottom row so segment analysis does not clip.
    const layout = [
      { x: 0.56, y: 1.54, w: 5.85, h: 1.90 },
      { x: 6.82, y: 1.54, w: 5.85, h: 1.90 },
      { x: 0.56, y: 3.56, w: 5.85, h: 1.90 },
      { x: 6.82, y: 3.56, w: 5.85, h: 1.90 },
      { x: 0.56, y: 5.58, w: 12.11, h: 1.72 }
    ];
    layout.forEach((box, idx) => {
      const isBottomRow = idx === 4;
      const raw = cleanText(blocks[idx] || segmentSignalUnavailable);
      const lines = raw.split(/\r?\n/).map((line) => cleanInlineText(line)).filter(Boolean);
      const heading = clampText(lines[0] || "Segment", isBottomRow ? 160 : 120);
      const detail = clampText(lines.slice(1).join(" ") || detailedMovementUnavailable, isBottomRow ? 620 : 420);
      const headingMatch = heading.match(/^(.+?)\s*-\s*([+-]?\d+(?:[.,]\d+)?%.*)$/i);
      const headingPrefix = headingMatch ? headingMatch[1].trim() : heading;
      const headingSuffix = headingMatch ? headingMatch[2].trim() : "";
      const headingFontSize = isBottomRow ? 12.0 : 12.4;
      const detailFontSize = isBottomRow ? 9.8 : 10.0;

      slide.addShape("roundRect", {
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        radius: segmentTileRadiusIn,
        rectRadius: segmentTileRadiusIn,
        line: { color: toColor("#AFC4F5"), pt: 0.7 },
        fill: { color: toColor(deck.theme.colors.paper), transparency: 0 }
      });
      const headingRuns = headingSuffix
        ? [
            { text: `${headingPrefix} - `, options: { color: toColor(deck.theme.colors.ink) } },
            { text: headingSuffix, options: { color: toColor(deck.theme.colors.accent) } }
          ]
        : [{ text: headingPrefix, options: { color: toColor(deck.theme.colors.ink) } }];
      slide.addText(headingRuns, {
        x: box.x + 0.22,
        y: box.y + 0.14,
        w: box.w - 0.36,
        h: isBottomRow ? 0.32 : 0.34,
        fontFace: deck.theme.fonts.heading,
        fontSize: headingFontSize,
        margin: 0
      });
      slide.addText(detail, {
        x: box.x + 0.22,
        y: box.y + 0.48,
        w: box.w - 0.36,
        h: box.h - 0.56,
        fontFace: deck.theme.fonts.body,
        fontSize: detailFontSize,
        color: toColor(deck.theme.colors.ink),
        breakLine: true,
        margin: 0
      });
    });
    return;
  }

  if (spec.kind === "new-emerging") {
    const cards = (spec.bullets || []).slice(0, 4);
    const layout = [
      { x: 0.66, y: 1.95 },
      { x: 6.24, y: 1.95 },
      { x: 0.66, y: 4.2 },
      { x: 6.24, y: 4.2 }
    ];
    layout.forEach((box, idx) => {
      slide.addShape("roundRect", {
        x: box.x,
        y: box.y,
        w: 5.45,
        h: 1.9,
        radius: 0.04,
        line: { color: toColor(deck.theme.colors.highlight), pt: 0.8 },
        fill: { color: toColor(deck.theme.colors.highlight), transparency: 10 }
      });
      slide.addText(cards[idx] || "Publisher note not available.", {
        x: box.x + 0.2,
        y: box.y + 0.25,
        w: 5.05,
        h: 1.45,
        fontFace: deck.theme.fonts.body,
        fontSize: 12,
        color: toColor(deck.theme.colors.ink),
        breakLine: true,
        margin: 0
      });
    });
    addCallout(
      slide,
      deck,
      "Emerging publishers are defined as partners with limited active history; full YoY signal is expected in the next cycle.",
      6.25,
      true
    );
    return;
  }

  if (spec.kind === "recommendations-blue") {
    const actions = (spec.bullets || []).slice(0, 5);
    actions.forEach((item, index) => {
      const y = 1.9 + index * 1.15;
      slide.addShape("roundRect", {
        x: 0.54,
        y: y + 0.04,
        w: 0.34,
        h: 0.34,
        radius: 0.04,
        line: { color: toColor(deck.theme.colors.paper), pt: 0.8 },
        fill: { color: toColor(deck.theme.colors.paper), transparency: 18 }
      });
      slide.addText(String(index + 1), {
        x: 0.64,
        y: y + 0.11,
        w: 0.14,
        h: 0.16,
        align: "center",
        fontFace: deck.theme.fonts.heading,
        fontSize: 10,
        bold: true,
        color: toColor(deck.theme.colors.ink),
        margin: 0
      });
      slide.addText(`${index + 1}. ${item}`, {
        x: 1.0,
        y,
        w: 11.7,
        h: 0.88,
        fontFace: deck.theme.fonts.body,
        fontSize: 13,
        color: toColor(deck.theme.colors.paper),
        breakLine: true,
        margin: 0
      });
    });
    return;
  }

  if (spec.kind === "kpi-table" || spec.kind === "publisher-table" || spec.kind === "program-breakdown" || spec.kind === "appendix" || spec.kind === "risks-dependencies") {
    const isProgramTable = spec.kind === "kpi-table" || spec.kind === "program-breakdown";
    const tableY = isProgramTable ? 1.78 : 1.95;
    const hasFooterNote = spec.kind === "kpi-table" && Boolean(cleanInlineText(spec.footerNote || ""));
    const tableH = isProgramTable ? (hasFooterNote ? 5.05 : 5.55) : (spec.kind === "appendix" ? 5.15 : 4.85);
    let renderedTable = null;
    if (spec.tables && spec.tables[0]) {
      renderedTable = addTable(slide, deck, spec.tables[0], {
        x: 0.40,
        y: tableY,
        w: 12.50,
        h: tableH
      });
    }
    if (hasFooterNote) {
      const footerY = renderedTable
        ? Math.min(7.05, tableY + renderedTable.containerH + 0.06)
        : 6.95;
      slide.addText(spec.footerNote, {
        x: 0.52,
        y: footerY,
        w: 12.2,
        h: 0.34,
        fontFace: deck.theme.fonts.body,
        fontSize: 10.2,
        color: toColor(deck.theme.colors.ink),
        margin: 0,
        breakLine: true
      });
    }
    return;
  }

  if (spec.kind === "executive-summary" || spec.kind === "program-overview" || spec.kind === "recommendations") {
    if (spec.headline) {
      slide.addText(spec.headline, {
        x: 0.86,
        y: 1.34,
        w: 5.6,
        h: 0.72,
        fontFace: deck.theme.fonts.heading,
        fontSize: 26,
        color: toColor(deck.theme.colors.ink),
        margin: 0
      });
    }
    if (spec.summary) {
      slide.addText(spec.summary, {
        x: 0.88,
        y: spec.headline ? 2.06 : 1.42,
        w: 5.3,
        h: 0.58,
        fontFace: deck.theme.fonts.body,
        fontSize: 12,
        color: toColor(deck.theme.colors.muted),
        margin: 0
      });
    }
    addBullets(slide, deck, spec.bullets, { x: 0.88, y: 2.84, w: 5.3, h: 3.52 });
    if (spec.kpis && spec.kpis.length) {
      addKpis(slide, deck, spec.kpis, { x: 6.82, y: 1.4 });
    }
    return;
  }

  if (spec.kind === "kpi-snapshot") {
    addKpis(slide, deck, spec.kpis, { x: 0.88, y: 1.72 });
    addBullets(slide, deck, spec.bullets, { x: 0.9, y: 4.52, w: 11.3, h: 1.48 });
    return;
  }

  if (spec.tables && spec.tables[0]) {
    addTable(slide, deck, spec.tables[0], {
      x: 0.88,
      y: spec.kind === "appendix" ? 1.42 : 1.5,
      w: 11.52,
      h: spec.kind === "appendix" ? 5.35 : 5.0
    });
  }
}

async function renderDeck(deck) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "QBR PPTX Service";
  pptx.company = deck.theme.companyName;
  pptx.subject = "Quarterly business review";
  pptx.title = deck.metadata.deckTitle;

  deck.slides.forEach((spec, index) => {
    const slide = pptx.addSlide();
    renderSlide(slide, deck, spec, index + 1);
  });

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

function safeName(value) {
  return String(value || "qbr_deck")
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase() || "qbr_deck";
}

async function generatePresentation(payload, options = {}) {
  const normalized = normalizePayload(payload || {});
  const theme = resolveTheme(normalized.themeName, normalized.themeOverrides);
  const deckSpec = buildDeckSpec(normalized, theme);
  const localizedDeckSpec = await localizeDeckSpec(deckSpec, normalized.languageCode);
  const buffer = await renderDeck(localizedDeckSpec);
  const fileName = normalized.outputFileName || `${safeName(localizedDeckSpec.metadata.deckTitle)}_${crypto.randomUUID()}.pptx`;

  return { normalized, deckSpec: localizedDeckSpec, buffer, fileName };
}

async function saveOutput(result, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const pptxPath = path.join(outputDir, result.fileName);
  await fs.writeFile(pptxPath, result.buffer);

  let deckSpecFileName = null;
  if (result.normalized.debug) {
    deckSpecFileName = result.fileName.replace(/\.pptx$/i, ".deck-spec.json");
    await fs.writeFile(path.join(outputDir, deckSpecFileName), JSON.stringify(result.deckSpec, null, 2), "utf8");
  }

  return { pptxPath, deckSpecFileName };
}

module.exports = {
  generatePresentation,
  saveOutput
};

