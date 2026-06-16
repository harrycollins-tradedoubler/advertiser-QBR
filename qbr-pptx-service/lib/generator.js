const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const { sanitizeOutputFileName, writeCreateOnly } = require("./outputFiles");

function loadPackage(name) {
  try {
    return require(name);
  } catch (error) {
    const fallback = path.join(__dirname, "..", "..", "presentation-ai", "node_modules", name);
    return require(fallback);
  }
}

const PptxGenJS = loadPackage("pptxgenjs");
const JSZip = loadPackage("jszip");
const TEMPLATE_BLUE_BG_PATH = path.join(__dirname, "..", "assets", "qbr-bg-blue.png");
const TEMPLATE_LIGHT_BG_PATH = path.join(__dirname, "..", "assets", "qbr-bg-light.png");
const TD_WHITE_LOGO_PATH = path.join(__dirname, "..", "assets", "td-logo-white.png");
const FIFTH_ELEMENT_WIREFRAME_CYAN_PATH = path.join(__dirname, "..", "assets", "fifth-element-wireframe-cyan.png");
const HAS_TEMPLATE_BLUE_BG = fsSync.existsSync(TEMPLATE_BLUE_BG_PATH);
const HAS_TEMPLATE_LIGHT_BG = fsSync.existsSync(TEMPLATE_LIGHT_BG_PATH);
const HAS_FIFTH_ELEMENT_WIREFRAME_CYAN = fsSync.existsSync(FIFTH_ELEMENT_WIREFRAME_CYAN_PATH);
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

const WINDOWS_1252_BYTES = new Map([
  [0x20AC, 0x80],
  [0x201A, 0x82],
  [0x0192, 0x83],
  [0x201E, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02C6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8A],
  [0x2039, 0x8B],
  [0x0152, 0x8C],
  [0x017D, 0x8E],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201C, 0x93],
  [0x201D, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02DC, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9A],
  [0x203A, 0x9B],
  [0x0153, 0x9C],
  [0x017E, 0x9E],
  [0x0178, 0x9F]
]);

const MOJIBAKE_MARKER_PATTERN = /(?:Ã|Â|â|Å[¼º›š‚]|Ä[…™‡„]|Ãƒ|Ã¢|Ã…|Ã„)/;
const MOJIBAKE_MARKER_GLOBAL_PATTERN = /(?:Ã|Â|â|Å[¼º›š‚]|Ä[…™‡„]|Ãƒ|Ã¢|Ã…|Ã„)/g;

function cp1252ByteForChar(char) {
  const code = char.codePointAt(0);
  if (code <= 0xFF) return code;
  return WINDOWS_1252_BYTES.get(code);
}

function decodeWindows1252AsUtf8(text) {
  const bytes = [];
  for (const char of text) {
    const byte = cp1252ByteForChar(char);
    if (byte === undefined) return text;
    bytes.push(byte);
  }
  return Buffer.from(bytes).toString("utf8");
}

function mojibakeScore(text) {
  return (String(text).match(MOJIBAKE_MARKER_GLOBAL_PATTERN) || []).length;
}

function repairMojibake(value) {
  let current = String(value ?? "");
  for (let pass = 0; pass < 3; pass += 1) {
    if (!MOJIBAKE_MARKER_PATTERN.test(current)) break;
    const decoded = decodeWindows1252AsUtf8(current);
    if (decoded === current || decoded.includes("\uFFFD") || mojibakeScore(decoded) >= mojibakeScore(current)) break;
    current = decoded;
  }
  return current;
}

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
  toppublisherperformancetable: "topPublisherPerformance",
  toppublisherperformance: "topPublisherPerformance",
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
    heading: "Aptos",
    body: "Aptos",
    mono: "Aptos"
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
  kpiComparisonTemplate: "{current} vs {previous} PY",
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
    kpiComparisonTemplate: "{current} vs {previous} N-1",
    thankYouSubtitleTemplate: "Programme d'affiliation TD - {period} Revue trimestrielle",
    currentPeriod: "Période actuelle",
    comparisonPeriodYoy: "Période de comparaison (YoY)",
    basisYoy: "Référence : glissement annuel (YoY)",
    publisherActivityBySegment: "Activité des éditeurs par segment",
    keyObservations: "Observations clés",
    reportingPeriodPrefix: "Période de reporting",
    dataAsOfPrefix: "Données au",
    comparisonPeriodPrefix: "Période de comparaison",
    allFiguresStatement: "Toutes les valeurs sont présentées en {currency}, sauf indication contraire. La variation YoY est calculée entre la période actuelle et la période de comparaison.",
    analysisTagSuffix: "Analyse"
  },
  NL: {
    qbrReport: "QBR-rapport",
    anyQuestions: "Vragen?",
    kpiComparisonTemplate: "{current} vs {previous} vorig jaar",
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
    kpiComparisonTemplate: "{current} ggü. {previous} VJ",
    thankYouSubtitleTemplate: "TD Affiliate-Programm - {period} Quartalsbericht",
    currentPeriod: "Aktueller Zeitraum",
    comparisonPeriodYoy: "Vergleichszeitraum (YoY)",
    basisYoy: "Basis: Jahr-über-Jahr (YoY)",
    publisherActivityBySegment: "Publisher-Aktivität nach Segment",
    keyObservations: "Wichtigste Erkenntnisse",
    reportingPeriodPrefix: "Berichtszeitraum",
    dataAsOfPrefix: "Datenstand",
    comparisonPeriodPrefix: "Vergleichszeitraum",
    allFiguresStatement: "Alle Werte werden in {currency} angegeben, sofern nicht anders vermerkt. Die YoY-Abweichung wird als aktueller Zeitraum gegenüber Vergleichszeitraum berechnet.",
    analysisTagSuffix: "Analyse"
  },
  IT: {
    qbrReport: "Report QBR",
    anyQuestions: "Domande?",
    kpiComparisonTemplate: "{current} vs {previous} anno prec.",
    thankYouSubtitleTemplate: "Programma di affiliazione TD - {period} Revisione trimestrale",
    currentPeriod: "Periodo corrente",
    comparisonPeriodYoy: "Periodo di confronto (YoY)",
    basisYoy: "Base: anno su anno (YoY)",
    publisherActivityBySegment: "Attività publisher per segmento",
    keyObservations: "Osservazioni chiave",
    reportingPeriodPrefix: "Periodo di reporting",
    dataAsOfPrefix: "Dati al",
    comparisonPeriodPrefix: "Periodo di confronto",
    allFiguresStatement: "Tutti i valori sono riportati in {currency}, salvo diversa indicazione. La variazione YoY è calcolata come periodo corrente vs periodo di confronto.",
    analysisTagSuffix: "Analisi"
  },
  NO: {
    qbrReport: "QBR-rapport",
    anyQuestions: "Spørsmål?",
    kpiComparisonTemplate: "{current} mot {previous} i fjor",
    thankYouSubtitleTemplate: "TD affiliateprogram - {period} kvartalsgjennomgang",
    currentPeriod: "Gjeldende periode",
    comparisonPeriodYoy: "Sammenligningsperiode (YoY)",
    basisYoy: "Grunnlag: år-over-år (YoY)",
    publisherActivityBySegment: "Publisheraktivitet etter segment",
    keyObservations: "Nøkkelobservasjoner",
    reportingPeriodPrefix: "Rapporteringsperiode",
    dataAsOfPrefix: "Data per",
    comparisonPeriodPrefix: "Sammenligningsperiode",
    allFiguresStatement: "Alle tall er oppgitt i {currency}, med mindre annet er angitt. YoY-variansen er beregnet som gjeldende periode mot sammenligningsperioden.",
    analysisTagSuffix: "Analyse"
  },
  SV: {
    qbrReport: "QBR-rapport",
    anyQuestions: "Några frågor?",
    kpiComparisonTemplate: "{current} mot {previous} fg. år",
    thankYouSubtitleTemplate: "TD affiliateprogram - {period} kvartalsgenomgång",
    currentPeriod: "Aktuell period",
    comparisonPeriodYoy: "Jämförelseperiod (YoY)",
    basisYoy: "Grund: år över år (YoY)",
    publisherActivityBySegment: "Publisheraktivitet per segment",
    keyObservations: "Viktiga observationer",
    reportingPeriodPrefix: "Rapporteringsperiod",
    dataAsOfPrefix: "Data per",
    comparisonPeriodPrefix: "Jämförelseperiod",
    allFiguresStatement: "Alla siffror rapporteras i {currency} om inget annat anges. YoY-variansen beräknas som aktuell period jämfört med jämförelseperiod.",
    analysisTagSuffix: "Analys"
  },
  DA: {
    qbrReport: "QBR-rapport",
    anyQuestions: "Nogen spørgsmål?",
    kpiComparisonTemplate: "{current} mod {previous} sidste år",
    thankYouSubtitleTemplate: "TD affiliateprogram - {period} kvartalsgennemgang",
    currentPeriod: "Aktuel periode",
    comparisonPeriodYoy: "Sammenligningsperiode (YoY)",
    basisYoy: "Grundlag: år-til-år (YoY)",
    publisherActivityBySegment: "Publisheraktivitet efter segment",
    keyObservations: "Nøgleobservationer",
    reportingPeriodPrefix: "Rapporteringsperiode",
    dataAsOfPrefix: "Data pr.",
    comparisonPeriodPrefix: "Sammenligningsperiode",
    allFiguresStatement: "Alle tal rapporteres i {currency}, medmindre andet er angivet. YoY-variansen beregnes som aktuel periode versus sammenligningsperiode.",
    analysisTagSuffix: "Analyse"
  },
  FI: {
    qbrReport: "QBR-raportti",
    anyQuestions: "Kysymyksiä?",
    kpiComparisonTemplate: "{current} vs {previous} ed. vuosi",
    thankYouSubtitleTemplate: "TD-kumppanuusohjelma - {period} neljännesvuosikatsaus",
    currentPeriod: "Nykyinen jakso",
    comparisonPeriodYoy: "Vertailujakso (YoY)",
    basisYoy: "Perusta: vuosi vuodelta (YoY)",
    publisherActivityBySegment: "Julkaisija-aktiivisuus segmenteittäin",
    keyObservations: "Keskeiset havainnot",
    reportingPeriodPrefix: "Raportointijakso",
    dataAsOfPrefix: "Tiedot päivältä",
    comparisonPeriodPrefix: "Vertailujakso",
    allFiguresStatement: "Kaikki luvut raportoidaan valuutassa {currency}, ellei toisin mainita. YoY-vaihtelu lasketaan nykyisen jakson ja vertailujakson välillä.",
    analysisTagSuffix: "Analyysi"
  },
  ES: {
    qbrReport: "Informe QBR",
    anyQuestions: "¿Preguntas?",
    kpiComparisonTemplate: "{current} vs {previous} año ant.",
    thankYouSubtitleTemplate: "Programa de afiliación TD - {period} Revisión trimestral",
    currentPeriod: "Período actual",
    comparisonPeriodYoy: "Período de comparación (YoY)",
    basisYoy: "Base: interanual (YoY)",
    publisherActivityBySegment: "Actividad de publishers por segmento",
    keyObservations: "Observaciones clave",
    reportingPeriodPrefix: "Período del informe",
    dataAsOfPrefix: "Datos a fecha de",
    comparisonPeriodPrefix: "Período de comparación",
    allFiguresStatement: "Todas las cifras se presentan en {currency}, salvo que se indique lo contrario. La variación YoY se calcula como período actual frente a período de comparación.",
    analysisTagSuffix: "Análisis"
  },
  PL: {
    qbrReport: "Raport QBR",
    anyQuestions: "Pytania?",
    kpiComparisonTemplate: "{current} vs {previous} r/r",
    thankYouSubtitleTemplate: "Program partnerski TD - {period} Przegląd kwartalny",
    currentPeriod: "Bieżący okres",
    comparisonPeriodYoy: "Okres porównawczy (r/r)",
    basisYoy: "Podstawa: rok do roku (r/r)",
    publisherActivityBySegment: "Aktywność wydawców według segmentu",
    keyObservations: "Kluczowe obserwacje",
    reportingPeriodPrefix: "Okres raportowania",
    dataAsOfPrefix: "Dane na dzień",
    comparisonPeriodPrefix: "Okres porównawczy",
    allFiguresStatement: "Wszystkie wartości raportowane są w walucie {currency}, o ile nie wskazano inaczej. Zmiana r/r jest liczona jako bieżący okres względem okresu porównawczego.",
    analysisTagSuffix: "Analiza",
    segmentSignalUnavailable: "Sygnał segmentu jest niedostępny.",
    detailedMovementUnavailable: "Szczegółowy opis zmian nie jest dostępny w tym wyciągu.",
    kpiSignalGeneric: "Sygnał KPI",
    kpiDriverUnavailable: "Brak potwierdzonego czynnika na podstawie dostępnych danych KPI.",
    kpiDetailUnavailable: "Szczegóły nie są dostępne w bieżącym wyciągu.",
    kpiTitleConversionRateImprovement: "Poprawa współczynnika konwersji",
    kpiTitleSalesVolumePressure: "Presja na wolumen sprzedaży",
    kpiTitleAovGrowthOffset: "Wzrost AOV częściowo kompensujący spadek wolumenu",
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
  const repaired = TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), repairMojibake(raw));
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

const MARKET_SUFFIX_CODES = new Set([
  "AT", "AU", "BE", "CA", "CH", "DE", "DK", "ES", "EU", "FI", "FR", "IE", "IT",
  "NL", "NO", "PL", "PT", "SE", "UK", "US"
]);

const MARKET_SUFFIX_LABELS = new Map([
  ["AT", "AT"],
  ["AU", "AU"],
  ["BE", "BE"],
  ["BELGIUM", "Belgium"],
  ["CA", "CA"],
  ["CANADA", "Canada"],
  ["CH", "CH"],
  ["SWITZERLAND", "Switzerland"],
  ["DE", "DE"],
  ["GERMANY", "Germany"],
  ["DK", "DK"],
  ["DENMARK", "Denmark"],
  ["ES", "ES"],
  ["SPAIN", "Spain"],
  ["EU", "EU"],
  ["EUROPE", "Europe"],
  ["FI", "FI"],
  ["FINLAND", "Finland"],
  ["FR", "FR"],
  ["FRANCE", "France"],
  ["IE", "IE"],
  ["IRELAND", "Ireland"],
  ["IT", "IT"],
  ["ITALY", "Italy"],
  ["NL", "NL"],
  ["NETHERLANDS", "Netherlands"],
  ["NO", "NO"],
  ["NORWAY", "Norway"],
  ["PL", "PL"],
  ["POLAND", "Poland"],
  ["PT", "PT"],
  ["PORTUGAL", "Portugal"],
  ["SE", "SE"],
  ["SWEDEN", "Sweden"],
  ["UK", "UK"],
  ["UNITED KINGDOM", "United Kingdom"],
  ["US", "US"],
  ["USA", "US"],
  ["UNITED STATES", "United States"]
]);

function stripProgramMarketSuffix(value) {
  let text = cleanInlineText(value || "");
  if (!text) return "";

  text = text
    .replace(/\s*(?:\+\s*\d+\s+more\b[\s.]*)+$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const bracketMatch = text.match(/^(.*?)(?:\s*[\[(]([A-Za-z]{2,3})[\])])$/);
  if (bracketMatch && MARKET_SUFFIX_CODES.has(bracketMatch[2].toUpperCase())) {
    text = cleanInlineText(bracketMatch[1] || "");
  }

  const suffixMatch = text.match(/^(.*?)(?:\s+|\s*-\s*)([A-Za-z]{2,3})$/);
  if (suffixMatch && MARKET_SUFFIX_CODES.has(suffixMatch[2].toUpperCase())) {
    text = cleanInlineText(suffixMatch[1] || "");
  }

  return text.replace(/[\s.+-]+$/g, "").trim();
}

function extractProgramMarketSuffix(value) {
  let text = cleanInlineText(value || "");
  if (!text) return "";

  text = text
    .replace(/\s*(?:\+\s*\d+\s+more\b[\s.]*)+$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const bracketMatch = text.match(/^(.*?)(?:\s*[\[(]([A-Za-z][A-Za-z\s]{1,})[\])])$/);
  if (bracketMatch) {
    const candidate = cleanInlineText(bracketMatch[2] || "").toUpperCase();
    if (MARKET_SUFFIX_LABELS.has(candidate)) return MARKET_SUFFIX_LABELS.get(candidate);
  }

  const normalizedUpper = text.toUpperCase();
  const fullLabelMatches = Array.from(MARKET_SUFFIX_LABELS.keys())
    .filter((label) => !MARKET_SUFFIX_CODES.has(label))
    .sort((a, b) => b.length - a.length);
  for (const label of fullLabelMatches) {
    if (normalizedUpper === label || normalizedUpper.endsWith(` ${label}`) || normalizedUpper.endsWith(` - ${label}`)) {
      return MARKET_SUFFIX_LABELS.get(label);
    }
  }

  const suffixMatch = text.match(/^(.*?)(?:\s+|\s*-\s*)([A-Za-z]{2,3})$/);
  if (suffixMatch) {
    const candidate = cleanInlineText(suffixMatch[2] || "").toUpperCase();
    if (MARKET_SUFFIX_LABELS.has(candidate)) return MARKET_SUFFIX_LABELS.get(candidate);
  }

  return "";
}

function resolveProgramMarket(programName, marketSource) {
  const explicitMarket = cleanInlineText(marketSource || "");
  if (explicitMarket && explicitMarket !== "-") return explicitMarket;

  const derivedMarket = extractProgramMarketSuffix(programName);
  if (derivedMarket) return derivedMarket;

  const fallbackProgram = cleanInlineText(programName || "");
  return fallbackProgram && fallbackProgram !== "-" ? fallbackProgram : "-";
}

function readProgramNameCandidates(programScopeTable) {
  if (!programScopeTable) return [];

  if (Array.isArray(programScopeTable)) {
    return programScopeTable
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return "";
        return cleanInlineText(
          row.Program
          || row["Program Name"]
          || row.ProgramName
          || row.Name
          || ""
        );
      })
      .filter(Boolean);
  }

  if (Array.isArray(programScopeTable.rows) && Array.isArray(programScopeTable.columns)) {
    const idx = Object.fromEntries(programScopeTable.columns.map((column, index) => [cleanInlineText(column).toLowerCase(), index]));
    const aliases = ["program", "program name", "programname", "name"];
    return programScopeTable.rows
      .map((row) => {
        if (!Array.isArray(row)) return "";
        for (const alias of aliases) {
          const colIndex = idx[alias];
          if (colIndex === undefined) continue;
          const value = cleanInlineText(row[colIndex] || "");
          if (value) return value;
        }
        return "";
      })
      .filter(Boolean);
  }

  return [];
}

function normalizeDisplayClientName(client, programScopeTable) {
  const candidates = [
    cleanInlineText(client || ""),
    ...readProgramNameCandidates(programScopeTable)
  ]
    .map((value) => stripProgramMarketSuffix(value))
    .filter(Boolean);

  if (!candidates.length) return cleanInlineText(client || "Client");

  const unique = Array.from(new Set(candidates.map((value) => value.toLowerCase())));
  if (unique.length === 1) return candidates[0];
  return candidates[0];
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

function normalizePublisherCategorySlides(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((slide) => {
      if (!slide || typeof slide !== "object" || Array.isArray(slide)) return null;
      const category = cleanInlineText(slide.category || slide.promotionType || slide.promotionTypeName || "");
      const recommendedPublishers = Array.isArray(slide.recommendedPublishers)
        ? slide.recommendedPublishers
        : Array.isArray(slide.opportunityPublishers)
          ? slide.opportunityPublishers
          : [];
      const rows = normalizeRows(recommendedPublishers);
      if (!category || !rows.length) return null;
      return {
        programId: cleanInlineText(slide.programId || slide["Program ID"] || ""),
        category,
        recommendation: cleanInlineText(slide.recommendation || ""),
        evidence: normalizeStringList(slide.evidence),
        recommendedPublishers: rows
      };
    })
    .filter(Boolean);
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

function parsePayloadEnvelope(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function payloadCandidateScore(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return 0;
  let score = 0;
  if (candidate.programYoYTable) score += 50;
  if (candidate.programScopeTable || candidate.programLevelBreakdown || candidate.programBreakdownTable) score += 40;
  if (candidate.programOutput) score += 20;
  if (candidate.publisherTables) score += 20;
  if (candidate.client || candidate.clientName || candidate.programName || candidate.deckTitle) score += 10;
  if (candidate.reportingPeriod || candidate.comparisonPeriod) score += 5;
  return score;
}

function unwrapPayloadEnvelope(input, seen = new Set()) {
  const parsed = parsePayloadEnvelope(input);

  if (Array.isArray(parsed)) {
    const candidates = parsed
      .map((item) => unwrapPayloadEnvelope(item, seen))
      .filter((item) => item && typeof item === "object" && !Array.isArray(item));
    return candidates
      .sort((a, b) => payloadCandidateScore(b) - payloadCandidateScore(a))[0] || {};
  }

  if (!parsed || typeof parsed !== "object") return {};
  if (seen.has(parsed)) return parsed;
  seen.add(parsed);

  const nestedCandidates = ["json", "body", "data", "payload"]
    .map((key) => parsed[key])
    .filter((value) => value !== undefined && value !== null)
    .map((value) => unwrapPayloadEnvelope(value, seen))
    .filter((value) => value && typeof value === "object" && !Array.isArray(value));

  const bestNested = nestedCandidates
    .sort((a, b) => payloadCandidateScore(b) - payloadCandidateScore(a))[0];

  if (!bestNested || payloadCandidateScore(parsed) >= payloadCandidateScore(bestNested)) {
    return parsed;
  }

  return { ...parsed, ...bestNested };
}

function normalizePayload(payload) {
  payload = unwrapPayloadEnvelope(payload || {});
  const nestedPayload = payload && typeof payload.payload === "object" && payload.payload
    ? unwrapPayloadEnvelope(payload.payload)
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
  const client = cleanInlineText(payload.client || payload.clientName || nestedPayload.client || nestedPayload.clientName || "Client");
  const deckTitle = cleanInlineText(payload.deckTitle || nestedPayload.deckTitle || `QBR - ${client}`);
  const reportingPeriod = cleanInlineText(payload.reportingPeriod || nestedPayload.reportingPeriod || "Reporting period not provided");
  const comparisonPeriod = cleanInlineText(payload.comparisonPeriod || nestedPayload.comparisonPeriod || "Comparison period not provided");
  const qbrFocus = cleanInlineText(payload.qbrFocus || nestedPayload.qbrFocus || "General performance review");
  const qbrFocusDetail = cleanInlineText(payload.qbrFocusDetail || nestedPayload.qbrFocusDetail || "");
  const languageCode = normalizeLanguageCode(payload.languageCode || nestedPayload.languageCode || "EN");
  const languageName = cleanInlineText(payload.languageName || nestedPayload.languageName || "English");
  const locale = localeForLanguageCode(languageCode);
  const currencyCode = cleanInlineText(payload.currencyCode || nestedPayload.currencyCode || "EUR").toUpperCase();
  const programOutput = cleanText(payload.programOutput || nestedPayload.programOutput || "");
  const publisherAnalysis = cleanText(payload.publisherAnalysis || nestedPayload.publisherAnalysis || "");
  const executiveSummaryText = cleanInlineText(
    payload.executiveSummaryText || payload.programExecutiveSummaryText
    || nestedPayload.executiveSummaryText || nestedPayload.programExecutiveSummaryText || ""
  );
  const publisherOverviewObservations = normalizeStringList(
    payload.publisherOverviewObservations || payload.publisherKeyObservations || payload.keyObservations
    || nestedPayload.publisherOverviewObservations || nestedPayload.publisherKeyObservations || nestedPayload.keyObservations
  );
  const salesGrowthSignals = normalizeSignalItems(
    payload.salesGrowthSignals || payload.salesGrowthSignalBullets || payload.salesGrowthAnalysis
    || nestedPayload.salesGrowthSignals || nestedPayload.salesGrowthSignalBullets || nestedPayload.salesGrowthAnalysis
  );
  const rawProgramYoYTable = payload.programYoYTable || nestedPayload.programYoYTable;
  const rawProgramScopeTable = payload.programScopeTable || nestedPayload.programScopeTable
    || payload.programLevelBreakdown || nestedPayload.programLevelBreakdown
    || payload.programBreakdownTable || nestedPayload.programBreakdownTable;
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
  const rankingContext = { currencyCode, locale };
  const publisherOrderValueRanking = normalizeOrderValueRanking(
    payload.publisherOrderValueRanking
      || nestedPayload.publisherOrderValueRanking
      || payload.publisherTables?.publisherOrderValueRanking
      || nestedPayload.publisherTables?.publisherOrderValueRanking,
    rankingContext
  );
  const brandNewPublisherRanking = normalizeOrderValueRanking(
    payload.brandNewPublisherRanking
      || nestedPayload.brandNewPublisherRanking
      || payload.publisherTables?.brandNewPublisherRanking
      || nestedPayload.publisherTables?.brandNewPublisherRanking,
    rankingContext
  );
  const tables = normalizeTables(payload.publisherTables || nestedPayload.publisherTables || {});
  const publisherCategorySlides = normalizePublisherCategorySlides(
    payload.publisherCategorySlides
    || nestedPayload.publisherCategorySlides
    || payload.publisherCategoryRecommendationSlides
    || nestedPayload.publisherCategoryRecommendationSlides
    || payload.publisherRecommendationPack?.slides
    || nestedPayload.publisherRecommendationPack?.slides
    || payload.publisherTables?.publisherCategoryRecommendationSlides
    || nestedPayload.publisherTables?.publisherCategoryRecommendationSlides
  );
  const { metrics, metricMap } = normalizeMetrics(rawProgramYoYTable || []);
  const programScopeTable = (
    Array.isArray(rawProgramScopeTable)
    || (rawProgramScopeTable && typeof rawProgramScopeTable === "object" && Array.isArray(rawProgramScopeTable.rows))
  )
    ? rawProgramScopeTable
    : normalizeProgramScopeTable(rawProgramScopeTable);
  const displayClient = normalizeDisplayClientName(client, programScopeTable);

  return {
    requestId: cleanInlineText(payload.requestId || `qbr-${Date.now()}`),
    client,
    displayClient,
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
    publisherOrderValueRanking,
    brandNewPublisherRanking,
    publisherCategorySlides,
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

function formatKpiComparison(metric, languageCode) {
  if (!metric || !metric.current) return "";
  if (!metric.previous) return `${metric.current}`;
  const labels = uiLabelsForLanguage(languageCode);
  return cleanInlineText((labels.kpiComparisonTemplate || DEFAULT_UI_LABELS.kpiComparisonTemplate)
    .replace("{current}", metric.current)
    .replace("{previous}", metric.previous));
}

function metricCard(metric, languageCode = "EN") {
  if (!metric || !metric.current) return null;
  const comparison = formatKpiComparison(metric, languageCode);
  const summary = metric.variance ? `${comparison} - ${metric.variance}` : comparison;
  return {
    label: metric.label,
    value: metric.current,
    previous: metric.previous || "",
    comparison,
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

  const programLabel = cleanInlineText(input.displayClient || input.client || "Program");
  const periodLabel = parsePeriodRange(input.reportingPeriod, input.locale);
  const openingLine = isMultiProgramScope
    ? `Across ${selectedProgramCount} selected programs, performance was mixed in ${periodLabel}.`
    : (() => {
        const affiliateLabel = /affiliate program/i.test(programLabel)
          ? programLabel
          : `${programLabel} Affiliate Program`;
        return `The ${affiliateLabel} delivered mixed results in ${periodLabel}.`;
      })();
  const movementPhrase = (label, metric) => {
    const verb = movementVerb(metric);
    return `${label} ${verb} ${metric.variance || "N/A"}`;
  };

  return cleanInlineText(
    `${openingLine} ${movementPhrase("AOV", aov)} to ${aov.current || "-"} and ${movementPhrase("conversion rate", conv)}. Total sales ${movementVerb(sales)} ${sales.variance || "N/A"} YoY while click volume ${movementVerb(clicks)} ${clicks.variance || "N/A"}. Total order value ${movementVerb(ov)} ${ov.variance || "N/A"} to ${ov.current || "-"}. Full KPI breakdown follows on the next slides.`
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
        const programName = firstObjectValue(row, ["Program", "Program Name", "ProgramName", "Name"]);
        const marketSource = firstObjectValue(row, ["Market", "Country", "Region"]);
        const market = resolveProgramMarket(programName, marketSource);
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
        const programName = firstRowCell(row, idx, ["program", "program name", "programname", "name"]);
        const marketSource = firstRowCell(row, idx, ["market", "country", "region"]);
        const market = resolveProgramMarket(programName, marketSource);
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

function buildTopPublisherPerformanceTable(input) {
  const targetColumns = [
    "Publisher",
    "Site ID",
    "Clicks",
    "Sales",
    "Conversion Rate",
    "AOV",
    "Total Order Value",
    "YoY Change"
  ];

  const table = [
    input.tables.topPublisherPerformance,
    input.tables.topCurrentPerformers,
    input.tables.top10ByOV
  ].find((candidate) => Array.isArray(candidate?.rows) && candidate.rows.length);
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const firstValue = (row, aliases) => {
    if (!row || typeof row !== "object") return "-";
    const keys = Object.keys(row);
    const byLower = Object.fromEntries(keys.map((key) => [key.toLowerCase(), key]));
    for (const alias of aliases) {
      const key = byLower[String(alias).toLowerCase()];
      if (!key) continue;
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "-";
  };

  const mappedRows = rows.slice(0, 10).map((row) => [
    firstValue(row, ["Publisher", "publisher"]),
    firstValue(row, ["Site ID", "siteId", "SiteID"]),
    firstValue(row, ["Clicks", "Current Clicks"]),
    firstValue(row, ["Sales", "Current Sales"]),
    firstValue(row, ["Conversion Rate", "Conv Rate"]),
    firstValue(row, ["AOV"]),
    firstValue(row, ["Total Order Value", "Current OV", "Order Value"]),
    firstValue(row, ["YoY Change", "OV YoY %"])
  ]).filter((row) => row.some((cell) => cleanInlineText(cell) && cleanInlineText(cell) !== "-"));

  return {
    title: "Top Publisher Performance",
    columns: targetColumns,
    rows: mappedRows.length ? mappedRows : [["-", "-", "-", "-", "-", "-", "-", "-"]],
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
    if (/^(voucher|cashback|other|content|css)\s*[-\u2013\u2014]/i.test(text)) return false;
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
  const currentPerformanceSource = input.tables.topPublisherPerformance?.rows?.length
    ? input.tables.topPublisherPerformance
    : input.tables.topCurrentPerformers;
  const currentRows = (currentPerformanceSource?.rows || []).map((row) => ({
    segment: cleanInlineText(row.Segment || ""),
    publisher: cleanPublisherLabel(row.Publisher || ""),
    ov: cleanInlineText(row["Total Order Value"] || row["Order Value"] || row["Current OV"] || ""),
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
    return `${text.slice(0, maxChars - 1).trimEnd()}\u2026`;
  };

  const denseMode = rows.length > 5;

  return rows.map((row) => {
    const growthForSegment = growthRows.find((item) => item.segment.toLowerCase() === row.segment.toLowerCase());
    const declineForSegment = declineRows.find((item) => item.segment.toLowerCase() === row.segment.toLowerCase());
    const topCurrentInSegment = currentRows
      .filter((item) => item.segment.toLowerCase() === row.segment.toLowerCase())
      .sort((a, b) => (parseNumber(b.ov) || 0) - (parseNumber(a.ov) || 0))
      .slice(0, 2);
    const movementParts = [];
    if (growthForSegment) {
      movementParts.push(`Growth: ${growthForSegment.publisher} ${growthForSegment.ovDelta} OV YoY (${growthForSegment.ovPct}).`);
    }
    if (declineForSegment) {
      movementParts.push(`Drag: ${declineForSegment.publisher} ${declineForSegment.ovDelta} OV YoY (${declineForSegment.ovPct}).`);
    }
    if (topCurrentInSegment.length) {
      const contributorLine = topCurrentInSegment
        .map((item) => `${item.publisher}${item.ov ? ` (${item.ov})` : ""}`)
        .join(" and ");
      movementParts.push(`Leaders: ${contributorLine}.`);
    }
    const movementLine = movementParts.join(" ");
    const publisherPart = row.publishers && row.publishers !== "N/A"
      ? ` | ${row.publishers} publishers`
      : "";
    const defaultDetail = `${row.totalOv} total OV${publisherPart} | Sales: ${row.totalSales} (${row.salesYoy} YoY).${movementLine ? ` ${movementLine}` : ""}`;
    const aiDetail = aiNarrativeCandidates.find((line) =>
      new RegExp(`\\b${row.segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)
    );
    let detail = aiDetail && !movementLine && aiDetail.length > defaultDetail.length * 0.6
      ? `${defaultDetail} ${aiDetail}`
      : defaultDetail;
    detail = detail
      .replace(/\s*-\s*I\s+is\s+the\s+primary\s+drag/gi, " is the primary drag")
      .replace(/\s*-\s*I\s+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (denseMode) {
      const denseParts = [`${row.totalOv} total OV`, `Sales: ${row.totalSales}`];
      if (row.publishers && row.publishers !== "N/A") denseParts.push(`${row.publishers} publishers`);
      if (topCurrentInSegment[0]?.publisher) denseParts.push(`Leader: ${topCurrentInSegment[0].publisher}`);
      detail = denseParts.join(" | ");
    }
    detail = clampDetail(detail, denseMode ? 120 : 240);
    return `${row.segment} - ${row.ovYoy} OV YoY\n${detail}`;
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

function movementDirection(value) {
  const parsed = parseNumber(value);
  if (parsed === null || parsed === undefined) return "unknown";
  if (parsed > 0) return "up";
  if (parsed < 0) return "down";
  return "flat";
}

function metricMovement(metric) {
  if (!metric) return "unknown";
  if (metric.varianceValue !== null && metric.varianceValue !== undefined) {
    return movementDirection(metric.varianceValue);
  }
  if (metric.differenceValue !== null && metric.differenceValue !== undefined) {
    return movementDirection(metric.differenceValue);
  }
  return movementDirection(metric.variance || metric.difference);
}

function entityLabel(value, fallback = "Publisher") {
  return cleanInlineText(value || fallback)
    .replace(/\s*-\s*I$/i, "")
    .replace(/\s*-\s*I(?=\s|$)/gi, "")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function segmentMovementTitle(segment, row, standoutPublisher) {
  const salesDirection = movementDirection(row?.["Sales YoY %"]);
  const ovDirection = movementDirection(row?.["OV YoY %"]);
  const standoutName = standoutPublisher ? entityLabel(standoutPublisher.Publisher, "") : "";
  const standoutDirection = standoutPublisher
    ? [
      movementDirection(standoutPublisher["Sales YoY %"]),
      movementDirection(standoutPublisher["OV YoY %"]),
      movementDirection(standoutPublisher["OV YoY Change"])
    ]
    : [];
  const hasStandoutGrowth = standoutDirection.includes("up");

  if (salesDirection === "down" && ovDirection === "down") {
    return standoutName && hasStandoutGrowth
      ? `${segment} Segment Declined Despite ${standoutName} Growth`
      : `${segment} Segment Declined YoY`;
  }
  if (salesDirection === "down") return `${segment} Segment Sales Decline`;
  if (ovDirection === "down") return `${segment} Segment OV Pressure`;
  if (salesDirection === "up" && ovDirection === "up") return `${segment} Segment Sales and OV Growth`;
  if (salesDirection === "up" || ovDirection === "up") return `${segment} Segment Growth Signal`;
  return `${segment} Segment Performance Shift`;
}

function isLargestSegmentByValue(rows, targetSegment, column) {
  const target = cleanInlineText(targetSegment).toLowerCase();
  const normalized = (rows || [])
    .map((row) => ({
      segment: cleanInlineText(row.Segment).toLowerCase(),
      value: parseNumber(row[column])
    }))
    .filter((row) => row.segment && row.value !== null && row.value !== undefined);
  if (!normalized.length) return false;
  const maxValue = Math.max(...normalized.map((row) => row.value));
  const targetRow = normalized.find((row) => row.segment === target);
  return Boolean(targetRow && targetRow.value === maxValue);
}

function cashbackSegmentTitle(cashbackRow, segmentRows) {
  if (!cashbackRow) return "Cashback Segment Performance Signal";
  const salesDirection = movementDirection(cashbackRow["Sales YoY %"]);
  const ovDirection = movementDirection(cashbackRow["OV YoY %"]);
  const isLargestBase = isLargestSegmentByValue(segmentRows, "Cashback", "Total OV");
  const hasPressure = salesDirection === "down" || ovDirection === "down";
  const hasGrowth = salesDirection === "up" || ovDirection === "up";

  if (hasPressure && isLargestBase) return "Cashback Segment Under Pressure on Largest Volume Base";
  if (hasPressure) return "Cashback Segment Under Pressure";
  if (hasGrowth && isLargestBase) return "Cashback Segment Growth on Largest Volume Base";
  if (hasGrowth) return "Cashback Segment Growth Signal";
  return "Cashback Segment Performance Shift";
}

function conversionSignalTitle(metric) {
  const current = cleanInlineText(metric?.current || "");
  const suffix = current ? ` to ${current}` : "";
  const direction = metricMovement(metric);
  if (direction === "up") return `Conversion Rate Improved${suffix}`;
  if (direction === "down") return `Conversion Rate Softened${suffix}`;
  if (direction === "flat") return current ? `Conversion Rate Stable at ${current}` : "Conversion Rate Stable";
  return current ? `Conversion Rate Moved to ${current}` : "Conversion Rate Movement";
}

function aovSignalTitle(metric, topAovUps) {
  const direction = metricMovement(metric);
  if (direction === "up" && topAovUps.length > 1) return "AOV Growth Across Multiple Publishers";
  if (direction === "up" && topAovUps.length === 1) return `AOV Growth Led by ${entityLabel(topAovUps[0].Publisher)}`;
  if (direction === "up") return "AOV Growth Signal";
  if (direction === "down") return "AOV Pressure Across Publishers";
  if (direction === "flat") return "AOV Broadly Stable";
  return "AOV Movement";
}

function clickMovementFromMetric(metric) {
  if (!metric) return "unknown";
  if (metric.differenceValue !== null && metric.differenceValue !== undefined) {
    return movementDirection(metric.differenceValue);
  }
  return metricMovement(metric);
}

function clickSignalTitle(clicksMetric, topDecliners, top2ShareValue) {
  const direction = clickMovementFromMetric(clicksMetric);
  if (direction === "up" && topDecliners.length) {
    return "Publisher-Level Click Declines Within Overall Click Growth";
  }
  if (direction === "down" && topDecliners.length >= 2 && Number(top2ShareValue) >= 50) {
    return "Click Volume Decline Concentrated in Two Publishers";
  }
  if (direction === "down" && topDecliners.length) {
    return "Publisher Click Declines Drove Overall Click Loss";
  }
  if (direction === "up") return "Click Volume Growth";
  if (direction === "flat") return "Click Volume Broadly Stable";
  return "Click Volume Movement";
}

function clickSignalDetail(clicksMetric, topDecliners, top2ShareValue) {
  const totalLine = `Total clicks ${directionWord(clicksMetric?.differenceValue ?? clicksMetric?.varianceValue)} ${cleanInlineText(clicksMetric?.variance || "N/A")} (${cleanInlineText(clicksMetric?.difference || "N/A")}).`;
  if (!topDecliners.length) return `${totalLine} Publisher-level click decline concentration could not be confirmed from available movers data.`;

  const contributorLine = topDecliners
    .map((row) => `${entityLabel(row.Publisher)} contributed ${cleanInlineText(row["YoY Change"] || "N/A")} (${cleanInlineText(row["YoY %"] || "N/A")})`)
    .join(" and ");
  const direction = clickMovementFromMetric(clicksMetric);

  if (direction === "up") {
    return `${totalLine} ${contributorLine}, acting as localized drag despite overall click growth.`;
  }
  if (direction === "down") {
    const share = Number.isFinite(Number(top2ShareValue)) ? `${Number(top2ShareValue).toFixed(0)}%` : "N/A";
    return `${totalLine} ${contributorLine}, together representing approximately ${share} of total click loss.`;
  }
  return `${totalLine} ${contributorLine}, indicating uneven publisher-level traffic movement.`;
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
  const clickDirection = clickMovementFromMetric(m.clicks);
  const top2ShareValue = clickDirection === "down" && clickLossAbs > 0 ? (top2LossAbs / clickLossAbs) * 100 : null;

  const signals = [
    {
      title: segmentMovementTitle("Voucher", voucherRow, topVoucherGrowth),
      detail: voucherRow && topVoucherGrowth
        ? `The Voucher segment recorded ${cleanInlineText(voucherRow["Sales YoY %"] || "N/A")} sales growth and ${cleanInlineText(voucherRow["OV YoY %"] || "N/A")} OV growth YoY. ${cleanInlineText(topVoucherGrowth.Publisher || "Top voucher publisher")} delivered ${cleanInlineText(topVoucherGrowth["Current Sales"] || "N/A")} sales (${cleanInlineText(topVoucherGrowth["Sales YoY %"] || "N/A")}) and ${cleanInlineText(topVoucherGrowth["OV YoY Change"] || "N/A")} in OV (${cleanInlineText(topVoucherGrowth["OV YoY %"] || "N/A")}) year-over-year.`
        : "Voucher growth signal is not fully available in the current extract."
    },
    {
      title: conversionSignalTitle(m.convrate),
      detail: `Programme conversion rate moved from ${cleanInlineText(m.convrate?.previous || "N/A")} to ${cleanInlineText(m.convrate?.current || "N/A")} (${cleanInlineText(m.convrate?.variance || "N/A")}). Sales changed ${formatSignedCount(parseNumber(m.sales?.difference), input.locale)} while clicks changed ${formatSignedCount(parseNumber(m.clicks?.difference), input.locale)}, indicating the quality shift in converting traffic.`
    },
    {
      title: aovSignalTitle(m.aov, topAovUps),
      detail: topAovUps.length
        ? `Programme AOV moved ${cleanInlineText(m.aov?.variance || "N/A")} to ${cleanInlineText(m.aov?.current || "N/A")}. Largest AOV uplifts came from ${topAovUps.map((row) => `${cleanInlineText(row.Publisher || "Publisher")} (${cleanInlineText(row["YoY Change"] || "N/A")}, ${cleanInlineText(row["YoY %"] || "N/A")})`).join(", ")}.`
        : `Programme AOV moved ${cleanInlineText(m.aov?.variance || "N/A")} to ${cleanInlineText(m.aov?.current || "N/A")}.`
    },
    {
      title: cashbackSegmentTitle(cashbackRow, segmentRows),
      detail: cashbackRow
        ? `Cashback accounts for ${cleanInlineText(cashbackRow["Total OV"] || "N/A")} in OV (${cleanInlineText(cashbackRow["OV YoY %"] || "N/A")}) across ${cleanInlineText(cashbackRow.Publishers || "N/A")} publishers. ${topCashbackPublishers.length ? topCashbackPublishers.map((row) => `${cleanInlineText(row.Publisher || "Publisher")} (${cleanInlineText(row["Current Sales"] || "N/A")} sales, ${cleanInlineText(row["Sales YoY %"] || "N/A")})`).join(" and ") : "Top cashback contributors remain concentrated in a small group"} are the primary contributors by sales count.`
        : "Cashback segment-level signal is not fully available in the current extract."
    },
    {
      title: clickSignalTitle(m.clicks, topClickDecliners, top2ShareValue),
      detail: clickSignalDetail(m.clicks, topClickDecliners, top2ShareValue)
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

function formatCompactMoney(value, currencyCode, locale = "en-GB") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const symbol = getCurrencySymbol(currencyCode);
  const n = Number(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const compact = (divisor, suffix) => {
    const scaled = abs / divisor;
    const decimals = scaled >= 10 ? 1 : 2;
    return `${Number(scaled.toFixed(decimals)).toLocaleString(locale || "en-GB")}${suffix}`;
  };
  if (abs >= 1_000_000) return `${sign}${symbol}${compact(1_000_000, "m")}`;
  if (abs >= 1_000) return `${sign}${symbol}${compact(1_000, "k")}`;
  return `${sign}${symbol}${Math.round(abs).toLocaleString(locale || "en-GB")}`;
}

function formatFullMoney(value, currencyCode, locale = "en-GB") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const symbol = getCurrencySymbol(currencyCode);
  const n = Number(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${symbol}${Math.round(abs).toLocaleString(locale || "en-GB")}`;
}

function buildOrderValueRankingFromTables(input, sourceTables, options = {}) {
  const labelFormatter = typeof options.labelFormatter === "function"
    ? options.labelFormatter
    : (value) => formatCompactMoney(value, input.currencyCode, input.locale || "en-GB");
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 10;
  const rowsByPublisher = new Map();
  sourceTables.filter((table) => table && Array.isArray(table.rows)).forEach((table) => {
    table.rows.forEach((row) => {
      const publisher = compactLabel(readTableCell(row, ["Publisher", "Program Name", "Program", "Name"]), 34);
      if (!publisher || publisher === "-") return;
      const siteId = readTableCell(row, ["Site ID", "SiteID", "Site Id", "Program ID", "ProgramId", "ProgramID"]);
      const segment = readTableCell(row, ["Segment", "Category", "Publisher Segment"]);
      const rawOrderValue = readTableCell(row, ["Order Value", "Current OV", "Current Order Value", "Total Order Value", "Total OV"]);
      const orderValue = parseNumber(rawOrderValue);
      if (!Number.isFinite(orderValue)) return;

      const key = `${publisher.toLowerCase()}|${siteId.toLowerCase()}`;
      const candidate = {
        publisher,
        siteId,
        segment,
        value: orderValue,
        label: labelFormatter(orderValue)
      };
      const existing = rowsByPublisher.get(key);
      if (!existing || candidate.value > existing.value) rowsByPublisher.set(key, candidate);
    });
  });

  const ranked = Array.from(rowsByPublisher.values())
    .filter((row) => row.publisher && Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value || a.publisher.localeCompare(b.publisher));

  const top = ranked.slice(0, limit);
  let bottom;
  if (options.distinctBottomFromTop) {
    const topKeys = new Set(top.map((row) => `${row.publisher.toLowerCase()}|${(row.siteId || "").toLowerCase()}`));
    bottom = ranked
      .filter((row) => !topKeys.has(`${row.publisher.toLowerCase()}|${(row.siteId || "").toLowerCase()}`))
      .sort((a, b) => a.value - b.value || a.publisher.localeCompare(b.publisher))
      .slice(0, limit);
    if (options.hideBottomWhenEmpty && !bottom.length) bottom = [];
  } else {
    bottom = ranked.slice().sort((a, b) => a.value - b.value || a.publisher.localeCompare(b.publisher)).slice(0, limit);
  }

  return {
    top,
    bottom,
    sourceCount: ranked.length
  };
}

function normalizeOrderValueRanking(input, context) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const normalizeRankingRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        const publisher = compactLabel(readTableCell(row, ["publisher", "Publisher", "name", "Name"]), 34);
        if (!publisher || publisher === "-") return null;
        const rawValue = row.value ?? readTableCell(row, ["value", "Order Value", "Current OV", "Current Order Value", "Total Order Value", "Total OV"]);
        const value = typeof rawValue === "number" ? rawValue : parseNumber(rawValue);
        if (!Number.isFinite(value)) return null;
        return {
          publisher,
          siteId: cleanInlineText(row.siteId ?? readTableCell(row, ["Site ID", "SiteID", "Site Id"]), ""),
          segment: cleanInlineText(row.segment ?? readTableCell(row, ["Segment", "Category", "Publisher Segment"]), ""),
          value,
          label: cleanInlineText(row.label || "", "") || formatCompactMoney(value, context.currencyCode, context.locale || "en-GB")
        };
      })
      .filter(Boolean);
  };

  const top = normalizeRankingRows(input.top);
  const bottom = normalizeRankingRows(input.bottom);
  if (!top.length && !bottom.length) return null;

  return {
    top,
    bottom,
    sourceCount: Number.isFinite(Number(input.sourceCount)) ? Number(input.sourceCount) : Math.max(top.length, bottom.length)
  };
}

function buildPublisherOrderValueRanking(input) {
  if (input.publisherOrderValueRanking) return input.publisherOrderValueRanking;
  return buildOrderValueRankingFromTables(input, [
    input.tables.publisherPerformanceSummary,
    input.tables.topCurrentPerformers,
    input.tables.topGrowthPublishers,
    input.tables.topDecliningPublishers,
    input.tables.brandNewPublishers,
    input.tables.brandNewPrograms,
    input.tables.moversOrderValue
  ]);
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

function conversionKpiTitle(metric) {
  const direction = metricMovement(metric);
  if (direction === "up") return "Conversion Rate Improved";
  if (direction === "down") return "Conversion Rate Pressure";
  if (direction === "flat") return "Conversion Rate Stable";
  return "Conversion Rate Movement";
}

function conversionKpiImplication(conv, clicks, sales) {
  const convDirection = metricMovement(conv);
  const clickDirection = metricMovement(clicks);
  const salesDirection = metricMovement(sales);

  if (convDirection === "up") return "indicating a more efficient sales-to-click mix than in the prior year.";
  if (convDirection === "down" && clickDirection === "up" && salesDirection === "down") {
    return "indicating added traffic did not convert into sales efficiently.";
  }
  if (convDirection === "down") return "indicating lower sales efficiency from available traffic.";
  if (convDirection === "flat") return "indicating broadly stable traffic conversion efficiency.";
  return "indicating a shift in converting traffic.";
}

function salesVolumeKpiTitle(metric) {
  const direction = metricMovement(metric);
  if (direction === "up") return "Sales Volume Growth";
  if (direction === "down") return "Sales Volume Pressure";
  if (direction === "flat") return "Sales Volume Stable";
  return "Sales Volume Movement";
}

function aovKpiTitle(aov, sales, orderValue) {
  const aovDirection = metricMovement(aov);
  const salesDirection = metricMovement(sales);
  const ovDirection = metricMovement(orderValue);

  if (aovDirection === "up" && salesDirection === "down") return "AOV Growth Partially Offsetting Sales Decline";
  if (aovDirection === "up" && ovDirection === "down") return "AOV Growth Partially Offsetting OV Decline";
  if (aovDirection === "up") return "AOV Growth";
  if (aovDirection === "down") return "AOV Pressure";
  if (aovDirection === "flat") return "AOV Stable";
  return "AOV Movement";
}

function aovKpiDetail(aov, sales, orderValue, topAovUpliftText) {
  const aovSentence = metricSentence("AOV", aov);
  const ovSentence = `Total order value ${directionWord(orderValue?.varianceValue)} ${orderValue?.variance || "N/A"} (${orderValue?.difference || "-"}).`;
  const aovDirection = metricMovement(aov);
  const salesDirection = metricMovement(sales);
  const ovDirection = metricMovement(orderValue);

  if (aovDirection === "up" && salesDirection === "down" && ovDirection === "down") {
    return `${aovSentence} ${ovSentence} Higher basket value only partly offset lower transaction volume. ${topAovUpliftText}`;
  }
  if (aovDirection === "up" && salesDirection === "down") {
    return `${aovSentence} ${ovSentence} Higher basket value helped offset lower transaction volume. ${topAovUpliftText}`;
  }
  if (aovDirection === "up") {
    return `${aovSentence} ${ovSentence} ${topAovUpliftText}`;
  }
  if (aovDirection === "down") {
    return `${aovSentence} ${ovSentence} Lower basket value added pressure to revenue performance.`;
  }
  return `${aovSentence} ${ovSentence} ${topAovUpliftText}`;
}

function cpaKpiTitle(metric) {
  const direction = metricMovement(metric);
  if (direction === "up") return "Rising CPA";
  if (direction === "down") return "CPA Efficiency Improved";
  if (direction === "flat") return "CPA Stable";
  return "CPA Movement";
}

function cpaKpiDetail(cpa, publisherCommission) {
  const direction = metricMovement(cpa);
  const costPhrase = direction === "down"
    ? "a lower acquisition cost"
    : direction === "up"
      ? "a higher acquisition cost"
      : direction === "flat"
        ? "a broadly stable acquisition cost"
        : "a changed acquisition cost";
  return `${metricSentence("CPA", cpa)} Publisher commission changed ${publisherCommission?.variance || "N/A"} (${publisherCommission?.difference || "-"}) year-over-year, so each conversion carried ${costPhrase}.`;
}

function roiKpiTitle(metric) {
  const direction = metricMovement(metric);
  if (direction === "up") return "ROI Improved";
  if (direction === "down") return "ROI Pressure";
  if (direction === "flat") return "ROI Stable";
  return "ROI Trend";
}

function roiKpiDetail(metric) {
  const direction = metricMovement(metric);
  const efficiencyPhrase = direction === "up"
    ? "improved spend efficiency"
    : direction === "down"
      ? "weaker spend efficiency"
      : direction === "flat"
        ? "stable spend efficiency"
        : "changed spend efficiency";
  return `${metricSentence("ROI", metric)} For every unit of commission in the current period, programme return moved from ${metric?.previous || "-"} to ${metric?.current || "-"}, showing ${efficiencyPhrase}.`;
}

function isSafeKpiSupplement(line, metrics) {
  const text = cleanInlineText(line || "");
  if (!text) return false;
  const title = cleanInlineText(text.split(":")[0] || "");
  const titleLower = title.toLowerCase();
  const textLower = text.toLowerCase();

  if (title.length > 68) return false;
  if (!text.includes(":")) return false;
  if (metricMovement(metrics.convrate) === "down" && /conversion rate improvement/.test(titleLower)) return false;
  if (metricMovement(metrics.convrate) === "up" && /(conversion rate pressure|conversion rate decline|conversion rate declined)/.test(textLower)) return false;
  if (metricMovement(metrics.cpa) === "down" && (/(rising cpa|higher acquisition cost)/.test(textLower))) return false;
  if (metricMovement(metrics.cpa) === "up" && /(cpa efficiency improved|lower acquisition cost)/.test(textLower)) return false;
  if (metricMovement(metrics.roi) === "up" && /(roi pressure|weaker spend efficiency)/.test(textLower)) return false;
  if (metricMovement(metrics.roi) === "down" && /(roi improved|improved spend efficiency)/.test(textLower)) return false;
  return true;
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
  const kpiHighlightTableBullets = ["kpiHighlights", "kpiHighlightNarrative"]
    .flatMap((key) => buildKpiHighlightsBulletsFromTable(input.tables[key]))
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
    `${conversionKpiTitle(conv)}: ${metricSentence("Conversion rate", conv)} Click volume ${directionWord(clicks?.varianceValue)} ${clicks?.variance || "N/A"} (${clicks?.difference || "-"}) while sales ${directionWord(sales?.varianceValue)} ${sales?.variance || "N/A"} (${sales?.difference || "-"}), ${conversionKpiImplication(conv, clicks, sales)}`,
    `${salesVolumeKpiTitle(sales)}: Total sales ${directionWord(sales?.varianceValue)} ${sales?.variance || "N/A"} (${sales?.difference || "-"}). Click volume ${directionWord(clicks?.varianceValue)} ${clicks?.variance || "N/A"} (${clicks?.difference || "-"}). ${declineList ? `Largest declines came from ${declineList}.` : "Largest declining publisher contribution requires confirmation from mover tables."}`,
    `${aovKpiTitle(aov, sales, ov)}: ${aovKpiDetail(aov, sales, ov, topAovUpliftText)}`,
    `${cpaKpiTitle(cpa)}: ${cpaKpiDetail(cpa, m.publcommission)}`,
    `${roiKpiTitle(roi)}: ${roiKpiDetail(roi)}`
  ];
  const generated = bullets.map((line) => cleanInlineText(line)).filter(Boolean);
  const merged = [];
  const aiForUse = preferredAi.length >= 3 ? preferredAi : [];
  const supplemental = [...kpiHighlightTableBullets, ...aiForUse]
    .filter((line) => isSafeKpiSupplement(line, m));
  // Keep clean validated headings first; only append AI/table lines that do not contradict metric direction.
  [...generated, ...supplemental].forEach((line) => {
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

function publisherRecommendationValue(row, aliases, fallback = "-") {
  if (!row || typeof row !== "object" || Array.isArray(row)) return fallback;
  const keys = Object.keys(row);
  const byLower = Object.fromEntries(keys.map((key) => [cleanInlineText(key).toLowerCase(), key]));
  for (const alias of aliases) {
    const key = byLower[cleanInlineText(alias).toLowerCase()];
    if (!key) continue;
    const value = cleanInlineText(row[key]);
    if (value) return value;
  }
  return fallback;
}

function publisherRecommendationRank(row) {
  const totalConnections = parseNumber(publisherRecommendationValue(row, [
    "Total Connections",
    "totalConnections",
    "Connections"
  ], "0")) || 0;
  const acceptanceRatio = parseNumber(publisherRecommendationValue(row, [
    "Acceptance Ratio",
    "acceptanceRatio"
  ], "0")) || 0;
  return { totalConnections, acceptanceRatio };
}

function publisherRecommendationNumber(row, aliases, fallback = 0) {
  const parsed = parseNumber(publisherRecommendationValue(row, aliases, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publisherRecommendationText(row, aliases, fallback = "-") {
  const value = publisherRecommendationValue(row, aliases, fallback);
  return cleanInlineText(value || fallback, fallback);
}

function publisherAcceptanceRatioLabel(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

function slugForSlideId(value) {
  return cleanInlineText(value || "publisher-type")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "publisher-type";
}

function buildPublisherRecommendationWorkbookRows(input) {
  const rows = [];
  const fallbackProgramId = cleanInlineText((input.publisherProgramIds || [])[0] || input.publisherProgramId || input.programId || "", "");

  for (const categorySlide of input.publisherCategorySlides || []) {
    const category = cleanInlineText(categorySlide.category || "Publisher Type");
    const categoryProgramId = cleanInlineText(categorySlide.programId || categorySlide["Program ID"] || "", "");
    for (const row of categorySlide.recommendedPublishers || categorySlide.opportunityPublishers || []) {
      const acceptanceRatio = publisherRecommendationNumber(row, [
        "Acceptance Ratio",
        "acceptanceRatio"
      ], 0);
      const acceptedConnections = publisherRecommendationNumber(row, [
        "Accepted Connections",
        "acceptedConnections",
        "Accepted",
        "accepted"
      ], 0);
      const rejectedConnections = publisherRecommendationNumber(row, [
        "Rejected Connections",
        "rejectedConnections",
        "Rejected",
        "rejected"
      ], 0);

      rows.push({
        publisherType: publisherRecommendationValue(row, [
          "Publisher Type",
          "Promotion Type",
          "promotionTypeName",
          "category"
        ], category),
        publisherName: publisherRecommendationText(row, [
          "Publisher Name",
          "Publisher",
          "sourceName"
        ]),
        sourceId: publisherRecommendationText(row, [
          "Source ID",
          "SourceID",
          "sourceId",
          "siteId",
          "publisherId"
        ], "-"),
        programId: publisherRecommendationText(row, [
          "Program ID",
          "ProgramId",
          "ProgramID",
          "programId",
          "Publisher Program ID",
          "publisherProgramId"
        ], categoryProgramId || fallbackProgramId || "Publisher Recommendations"),
        description: publisherRecommendationText(row, [
          "Description",
          "description",
          "Themes"
        ], "-"),
        url: publisherRecommendationText(row, ["URL", "url"], "-"),
        acceptanceRatio,
        acceptedConnections,
        rejectedConnections
      });
    }
  }

  return rows
    .filter((row) => row.publisherName && row.publisherName !== "-")
    .sort((a, b) => {
      return (b.acceptedConnections - a.acceptedConnections)
        || (b.acceptanceRatio - a.acceptanceRatio)
        || (b.rejectedConnections - a.rejectedConnections)
        || a.publisherName.localeCompare(b.publisherName);
    });
}

function buildPublisherRecommendationSummaryTable(rows) {
  const groups = new Map();
  for (const row of rows) {
    const type = cleanInlineText(row.publisherType || "Unclassified", "Unclassified");
    if (!groups.has(type)) {
      groups.set(type, {
        type,
        publishers: 0,
        acceptedConnections: 0,
        acceptanceRatioTotal: 0,
        acceptanceRatioCount: 0
      });
    }
    const group = groups.get(type);
    group.publishers += 1;
    group.acceptedConnections += row.acceptedConnections;
    if (Number.isFinite(row.acceptanceRatio)) {
      group.acceptanceRatioTotal += row.acceptanceRatio;
      group.acceptanceRatioCount += 1;
    }
  }

  const summaryRows = Array.from(groups.values())
    .sort((a, b) => {
      const avgA = a.acceptanceRatioCount ? a.acceptanceRatioTotal / a.acceptanceRatioCount : 0;
      const avgB = b.acceptanceRatioCount ? b.acceptanceRatioTotal / b.acceptanceRatioCount : 0;
      return (b.acceptedConnections - a.acceptedConnections)
        || (avgB - avgA)
        || a.type.localeCompare(b.type);
    })
    .slice(0, 10)
    .map((group) => [
      group.type,
      String(group.publishers),
      Math.round(group.acceptedConnections).toLocaleString("en-GB"),
      publisherAcceptanceRatioLabel(
        group.acceptanceRatioCount ? group.acceptanceRatioTotal / group.acceptanceRatioCount : NaN
      )
    ]);

  return {
    title: "Publisher recommendation summary",
    columns: ["Publisher Type", "Publishers", "Accepted Connections", "Avg Acceptance Ratio"],
    rows: summaryRows.length ? summaryRows : [["-", "-", "-", "-"]],
    dense: false,
    colW: [4.1, 1.8, 2.8, 2.6]
  };
}

function buildPublisherRecommendationSlides(input) {
  const rows = buildPublisherRecommendationWorkbookRows(input);
  if (!rows.length) return [];

  return [{
    id: "publisher-expansion-opportunities",
    kind: "publisher-table",
    title: "Publisher Expansion Opportunities",
    subtitle: "Gap-analysis publisher prospects from advertiser/sources for AM review.",
    bullets: [],
    kpis: [],
    tables: [buildPublisherRecommendationSummaryTable(rows)],
    callout: "Full publisher recommendation detail is supplied in the Excel workbook, ranked by Accepted Connections then Acceptance Ratio."
  }];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildWorksheetXml(values, indexFor) {
  const rows = values.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="s"><v>${indexFor(value)}</v></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  const lastRow = Math.max(values.length, 1);
  const lastColumn = columnName(Math.max((values[0] || []).length - 1, 0));
  const sheetRef = `A1:${lastColumn}${lastRow}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="32" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/><col min="5" max="5" width="58" customWidth="1"/><col min="6" max="6" width="42" customWidth="1"/><col min="7" max="9" width="18" customWidth="1"/></cols>
<sheetData>${rows}</sheetData>
<autoFilter ref="${sheetRef}"/>
</worksheet>`;
}

function createSharedStringIndexer() {
  const strings = [];
  const indexByValue = new Map();
  const indexFor = (value) => {
    const normalized = cleanInlineText(value, "");
    if (!indexByValue.has(normalized)) {
      indexByValue.set(normalized, strings.length);
      strings.push(normalized);
    }
    return indexByValue.get(normalized);
  };

  const toXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}
</sst>`;

  return { indexFor, toXml };
}

function sanitizeExcelSheetName(value, fallback) {
  const cleaned = cleanInlineText(value || fallback || "Sheet", fallback || "Sheet")
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || fallback || "Sheet";
}

function uniqueExcelSheetName(value, used, fallback) {
  const base = sanitizeExcelSheetName(value, fallback);
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    const marker = ` ${suffix}`;
    name = `${base.slice(0, Math.max(1, 31 - marker.length))}${marker}`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

async function buildPublisherRecommendationWorkbook(input) {
  const rows = buildPublisherRecommendationWorkbookRows(input);
  if (!rows.length) return null;

  const columns = [
    "Program ID",
    "Publisher Type",
    "Publisher Name",
    "Source ID",
    "Description",
    "URL",
    "Acceptance Ratio",
    "Accepted Connections",
    "Rejected Connections"
  ];

  const groupedRows = new Map();
  for (const row of rows) {
    const programId = cleanInlineText(row.programId || "Publisher Recommendations", "Publisher Recommendations");
    if (!groupedRows.has(programId)) groupedRows.set(programId, []);
    groupedRows.get(programId).push(row);
  }

  const sharedStrings = createSharedStringIndexer();
  const usedSheetNames = new Set();
  const sheets = Array.from(groupedRows.entries()).map(([programId, programRows], index) => {
    const sheetValues = [
      columns,
      ...programRows.map((row) => [
        row.programId,
        row.publisherType,
        row.publisherName,
        row.sourceId,
        row.description,
        row.url,
        publisherAcceptanceRatioLabel(row.acceptanceRatio),
        Math.round(row.acceptedConnections).toLocaleString("en-GB"),
        Math.round(row.rejectedConnections).toLocaleString("en-GB")
      ])
    ];
    return {
      id: index + 1,
      relId: `rId${index + 1}`,
      name: uniqueExcelSheetName(programId, usedSheetNames, `Program ${index + 1}`),
      xml: buildWorksheetXml(sheetValues, sharedStrings.indexFor)
    };
  });

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((sheet) => `<Override PartName="/xl/worksheets/sheet${sheet.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.folder("xl").file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((sheet) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheet.id}" r:id="${sheet.relId}"/>`).join("")}</sheets>
</workbook>`);
  const styleRelId = `rId${sheets.length + 1}`;
  const sharedStringsRelId = `rId${sheets.length + 2}`;
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((sheet) => `<Relationship Id="${sheet.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.id}.xml"/>`).join("\n")}
<Relationship Id="${styleRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="${sharedStringsRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`);
  sheets.forEach((sheet) => {
    zip.folder("xl").folder("worksheets").file(`sheet${sheet.id}.xml`, sheet.xml);
  });
  zip.folder("xl").file("sharedStrings.xml", sharedStrings.toXml());
  zip.folder("xl").file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
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
      const card = metricCard(input.metricMap[cfg.key], input.languageCode);
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
        title: `${input.displayClient} Affiliate Program Quarterly Business Review`,
        subtitle: "",
        headline,
        summary: input.qbrFocusDetail
          ? `${input.qbrFocus}. ${input.qbrFocusDetail}`
          : `A comprehensive year-over-year analysis of the ${input.displayClient} affiliate program's performance, publisher dynamics, and strategic priorities to drive growth and optimise outcomes.`,
        bullets: [`Client: ${input.displayClient}`, `Reporting currency: ${input.currencyCode}`, `Language: ${input.languageName}`],
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
        subtitle: "",
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
        title: `${input.displayClient} - Thank you.`,
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
      client: input.displayClient,
      deckTitle: input.deckTitle,
      reportingPeriod: input.reportingPeriod,
      comparisonPeriod: input.comparisonPeriod,
      languageCode: input.languageCode,
      languageName: input.languageName,
      locale: input.locale || "en-GB",
      uiLabels: uiLabelsForLanguage(input.languageCode),
      currencyCode: input.currencyCode,
      qbrFocus: input.qbrFocus,
      analysisLevel: "publisher_program",
      analysisProgramIds: Array.isArray(input.analysisProgramIds) ? input.analysisProgramIds : [],
      generatedAt: new Date().toISOString()
    },
    theme,
    slides
  };
}

function buildDeckSpec(input, theme) {
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
      const card = metricCard(input.metricMap[cfg.key], input.languageCode);
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
  const publisherOrderValueRanking = buildPublisherOrderValueRanking(input);
  const brandNewOrderValueRanking = input.brandNewPublisherRanking || buildOrderValueRankingFromTables(input, [brandNew], {
    labelFormatter: (value) => formatFullMoney(value, input.currencyCode, input.locale || "en-GB"),
    distinctBottomFromTop: true,
    hideBottomWhenEmpty: true
  });
  const kpiAnalysisBullets = buildKpiAnalysisBullets(input);
  const publisherOverviewBullets = buildPublisherOverviewBullets(input);
  const segmentPerformanceBlocks = buildSegmentPerformanceBlocks(input);
  const salesGrowthSignals = buildSalesGrowthSignals(input);
  const programBreakdownTable = buildProgramBreakdownTable(input);
  const topPublisherPerformanceTable = buildTopPublisherPerformanceTable(input);
  slides.push({
    id: "cover",
    kind: "cover",
    title: `${input.displayClient} Affiliate Program Quarterly Business Review`,
    subtitle: "",
    headline,
    summary: input.qbrFocusDetail
      ? `${input.qbrFocus}. ${input.qbrFocusDetail}`
      : `A comprehensive year-over-year analysis of the ${input.displayClient} affiliate program's performance, publisher dynamics, and strategic priorities to drive growth and optimise outcomes.`,
    bullets: [`Client: ${input.displayClient}`, `Reporting currency: ${input.currencyCode}`, `Language: ${input.languageName}`],
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
    subtitle: "",
    bullets: kpiAnalysisBullets,
    kpis: [],
    tables: []
  });

  slides.push({
    id: "publisher-overview",
    kind: "publisher-overview",
    title: "Publisher Performance Overview",
    subtitle: "High-level summary of publisher activity, segmentation and YoY movement.",
    bullets: segmentPerformanceBlocks,
    analysisTitle: "Segment Breakdown",
    analysisMaxBullets: segmentPerformanceBlocks.length,
    summaryTable: buildPublisherOverviewSummaryTable(segmentTable),
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
    id: "top-publisher-performance",
    kind: "program-breakdown",
    title: "Top Publisher Performance: Volume & Conversion",
    subtitle: "Top 10 publishers by current-period order value.",
    bullets: [],
    kpis: [],
    tables: [topPublisherPerformanceTable]
  });

  slides.push({
    id: "publisher-order-value-rankings",
    kind: "publisher-ov-ranking-bars",
    title: "Movers and Shakers: Publisher Performance",
    subtitle: `YoY order value movement ranking - ${input.reportingPeriod} vs ${input.comparisonPeriod}.`,
    bullets: [],
    ranking: publisherOrderValueRanking,
    panelTitles: {
      top: "Top 10 YoY OV growth publishers",
      bottom: "Top 10 YoY OV decline publishers"
    },
    footerNote: "Ranked by year-over-year order value change. Blue bars show largest positive OV movement; red bars show largest negative OV movement.",
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
    kind: "publisher-ov-ranking-bars",
    title: "Brand New Publishers",
    subtitle: `Current-period order value ranking for newly activated publishers - ${input.reportingPeriod}.`,
    bullets: [],
    ranking: brandNewOrderValueRanking,
    panelTitles: {
      top: "Highest order value new publishers",
      bottom: "Lower order value new publishers"
    },
    panelColors: {
      top: "#2F6FF2",
      bottom: "#7C97C8"
    },
    hideEmptyBottomPanel: true,
    footerNote: "Order value shown is current-period revenue from newly activated publishers. Values are not YoY changes.",
    kpis: [],
    tables: []
  });

  slides.push(...buildPublisherRecommendationSlides(input));

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
    title: `${input.displayClient} - Thank you.`,
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
      client: input.displayClient,
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
    "Publisher Performance",
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

function addFifthElementWireframe(slide, placement) {
  if (!HAS_FIFTH_ELEMENT_WIREFRAME_CYAN) return;
  slide.addImage({
    path: FIFTH_ELEMENT_WIREFRAME_CYAN_PATH,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h
  });
}

function ragColorForValue(value, deck, fallback = deck.theme.colors.ink) {
  const text = cleanInlineText(value || "");
  if (!text || text === "-" || /^n\/a$/i.test(text)) return toColor(fallback);
  const numeric = parseNumber(text);
  if (!Number.isFinite(numeric)) return toColor(fallback);
  if (numeric > 0) return toColor(deck.theme.colors.success);
  if (numeric < 0) return toColor(deck.theme.colors.accentAlt);
  return toColor(deck.theme.colors.warning);
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
    .replace(/[\u00A3$\u20AC,\s]/g, "")
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
    const trendColor = card.delta
      ? ragColorForValue(card.delta, deck, deck.theme.colors.muted)
      : toColor(card.trend === "flat" ? deck.theme.colors.warning : deck.theme.colors.muted);

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
    const comparisonText = cleanInlineText(card.comparison || baseText.replace(/\s*-\s*$/, "") || summary);
    slide.addText(comparisonText, {
      x: x + 0.22,
      y: y + 0.84,
      w: cardW - 0.35,
      h: hasDelta ? 0.28 : 0.52,
      fontFace: deck.theme.fonts.body,
      fontSize: 9.8,
      color: toColor(deck.theme.colors.ink),
      margin: 0,
      breakLine: true
    });
    if (hasDelta) {
      slide.addText(delta, {
        x: x + 0.22,
        y: y + 1.13,
        w: cardW - 0.35,
        h: 0.24,
        fontFace: deck.theme.fonts.body,
        fontSize: 10.6,
        bold: true,
        color: trendColor,
        margin: 0
      });
    }
  });
}

function isDeltaColumn(header) {
  const lower = cleanInlineText(header).toLowerCase();
  return lower.includes("change")
    || lower.includes("variance")
    || lower.includes("yoy")
    || lower.includes("trend")
    || lower.includes("delta")
    || lower.includes("+/-")
    || /%.*(?:increase|decrease|growth)|(?:increase|decrease|growth).*%/.test(lower);
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
  const text = cleanInlineText(value);
  const labelCell = text.toLowerCase().includes("variance");
  const signedDeltaValue = /^[+\-]/.test(text) || text.startsWith("â–²") || text.startsWith("â–¼");
  const useDeltaColor = isDeltaColumn(column) || (varianceRow && !labelCell) || (signedDeltaValue && text.includes("%"));
  if (!useDeltaColor) return toColor(deck.theme.colors.ink);

  const hintedTone = metricToneFromVarianceHints(table, column);
  if (hintedTone.startsWith("pos")) return toColor(deck.theme.colors.success);
  if (hintedTone.startsWith("neg")) return toColor(deck.theme.colors.accentAlt);
  if (hintedTone.startsWith("neu")) return toColor(deck.theme.colors.warning);
  if (hintedTone === "na") return toColor(deck.theme.colors.ink);

  return ragColorForValue(text, deck);
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
        textColor = ragColorForValue(valueText, deck);
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
  if (!colW) {
    const equalWidth = Number((innerW / Math.max(1, table.columns.length)).toFixed(3));
    colW = table.columns.map(() => equalWidth);
    const consumed = colW.reduce((sum, width) => sum + width, 0);
    colW[colW.length - 1] = Number((colW[colW.length - 1] + (innerW - consumed)).toFixed(3));
  }

  slide.addShape("rect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: containerH,
    line: { color: toColor("#D6DAE3"), pt: 0.7 },
    fill: { color: toColor(deck.theme.colors.paper) }
  });

  const rowHeights = [headerH, ...Array.from({ length: bodyCount }, () => bodyH)];
  const rows = [header, ...bodyRows];
  const border = { color: toColor("#E3E6EC"), pt: 0.3 };
  const cellPadX = 0.045;
  const cellPadY = 0.02;
  let cursorY = innerY;

  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] || bodyH;
    const maxFontSize = Math.max(7, Number((((rowHeight * 72) - 4) * 0.62).toFixed(1)));
    const defaultFontSize = rowIndex === 0
      ? (table.dense ? 9 : 10.5)
      : (table.dense ? 9 : 10);
    let cursorX = innerX;

    row.forEach((cell, cellIndex) => {
      const cellWidth = colW[cellIndex] || colW[colW.length - 1] || innerW;
      const fontSize = Math.min(defaultFontSize, maxFontSize);
      slide.addShape("rect", {
        x: cursorX,
        y: cursorY,
        w: cellWidth,
        h: rowHeight,
        line: border,
        fill: cell.options.fill
      });
      slide.addText(cleanInlineText(cell.text || "-"), {
        x: cursorX + cellPadX,
        y: cursorY + cellPadY,
        w: Math.max(0.08, cellWidth - (cellPadX * 2)),
        h: Math.max(0.08, rowHeight - (cellPadY * 2)),
        fontFace: cell.options.fontFace,
        fontSize,
        bold: cell.options.bold,
        color: cell.options.color,
        align: cell.options.align || "left",
        valign: cell.options.valign || "mid",
        margin: 0,
        breakLine: true
      });
      cursorX = Number((cursorX + cellWidth).toFixed(3));
    });

    cursorY = Number((cursorY + rowHeight).toFixed(3));
  });

  return { containerH, tableH: effectiveTableH };
}

function addPublisherOrderValueBars(slide, deck, spec) {
  const ranking = spec.ranking || {};
  const topRows = Array.isArray(ranking.top) ? ranking.top : [];
  const bottomRows = Array.isArray(ranking.bottom) ? ranking.bottom : [];
  const panelTitles = spec.panelTitles || {};
  const panelColors = spec.panelColors || {};
  const topColor = toColor(panelColors.top || deck.theme.colors.accent);
  const bottomColor = toColor(panelColors.bottom || deck.theme.colors.accentAlt);
  const singlePanel = Boolean(spec.hideEmptyBottomPanel) && !bottomRows.length;
  const muted = toColor(deck.theme.colors.muted);
  const axis = toColor("#D8DCE5");
  const track = toColor("#E7EBF3");

  slide.addText(spec.footerNote || "Ranked by current-period order value. Best and worst lists are calculated from available publisher-level rows in the QBR extract.", {
    x: 0.7,
    y: 6.92,
    w: 11.9,
    h: 0.22,
    fontFace: deck.theme.fonts.body,
    fontSize: 8.7,
    color: muted,
    margin: 0
  });

  const drawPanel = (title, rows, x, y, w, color) => {
    slide.addText(title, {
      x,
      y,
      w,
      h: 0.25,
      fontFace: deck.theme.fonts.heading,
      fontSize: 13.5,
      bold: true,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addShape("line", {
      x,
      y: y + 0.36,
      w,
      h: 0,
      line: { color: axis, pt: 0.7 }
    });

    if (!rows.length) {
      slide.addText("No publisher order value data available.", {
        x,
        y: y + 0.68,
        w,
        h: 0.34,
        fontFace: deck.theme.fonts.body,
        fontSize: 10,
        color: muted,
        margin: 0
      });
      return;
    }

    const maxValue = Math.max(...rows.map((row) => Math.abs(Number(row.value) || 0)), 1);
    const labelW = 1.78;
    const barX = x + labelW + 0.16;
    const barW = w - labelW - 1.1;
    const valueX = barX + barW + 0.14;
    const rowStep = 0.405;
    rows.slice(0, 10).forEach((row, index) => {
      const rowY = y + 0.62 + index * rowStep;
      const barLength = Math.max(0.06, (Math.abs(Number(row.value) || 0) / maxValue) * barW);
      slide.addText(`${index + 1}. ${compactLabel(row.publisher, 24)}`, {
        x,
        y: rowY - 0.005,
        w: labelW,
        h: 0.19,
        fontFace: deck.theme.fonts.body,
        fontSize: 7.9,
        color: toColor(deck.theme.colors.ink),
        margin: 0
      });
      slide.addShape("rect", {
        x: barX,
        y: rowY + 0.025,
        w: barW,
        h: 0.13,
        line: { color: track, pt: 0 },
        fill: { color: track }
      });
      slide.addShape("rect", {
        x: barX,
        y: rowY + 0.025,
        w: Number(barLength.toFixed(3)),
        h: 0.13,
        line: { color, pt: 0 },
        fill: { color }
      });
      slide.addText(row.label || "-", {
        x: valueX,
        y: rowY - 0.005,
        w: 0.88,
        h: 0.19,
        fontFace: deck.theme.fonts.body,
        fontSize: 7.8,
        color: toColor(deck.theme.colors.ink),
        align: "right",
        margin: 0
      });
    });
  };

  if (singlePanel) {
    drawPanel(panelTitles.top || "Top 10 YoY OV growth publishers", topRows, 0.72, 1.95, 11.92, topColor);
    return;
  }

  drawPanel(panelTitles.top || "Top 10 YoY OV growth publishers", topRows, 0.72, 1.95, 5.72, topColor);
  slide.addShape("line", {
    x: 6.67,
    y: 1.93,
    w: 0,
    h: 4.58,
    line: { color: axis, pt: 0.7, transparency: 12 }
  });
  drawPanel(panelTitles.bottom || "Top 10 YoY OV decline publishers", bottomRows, 6.92, 1.95, 5.72, bottomColor);
}

function segmentSnapshotRows(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const cell = (row, aliases) => {
    if (Array.isArray(row)) {
      const normalizedAliases = aliases.map((alias) => cleanInlineText(alias).toLowerCase());
      const index = columns.findIndex((column) => normalizedAliases.includes(cleanInlineText(column).toLowerCase()));
      return index >= 0 ? cleanInlineText(row[index] || "") : "";
    }
    return readTableCell(row, aliases);
  };

  return rows
    .map((row) => {
      const segment = cleanInlineText(cell(row, ["Segment", "Category", "Publisher Segment"]) || "Segment");
      const totalOv = cleanInlineText(cell(row, ["Total OV", "Order Value", "Sales Order Value", "Total Order Value"]) || "-");
      const value = parseNumber(totalOv);
      const sales = cleanInlineText(cell(row, ["Total Sales", "Sales"]) || "-");
      const salesValue = parseNumber(sales);
      return {
        segment,
        totalOv,
        value: Number.isFinite(value) ? value : 0,
        ovYoy: cleanInlineText(cell(row, ["OV YoY %", "YoY Change", "Order Value YoY %"]) || "N/A"),
        sales,
        salesValue: Number.isFinite(salesValue) ? salesValue : 0,
        salesYoy: cleanInlineText(cell(row, ["Sales YoY %"]) || ""),
        publishers: cleanInlineText(cell(row, ["Publishers", "Publisher Count"]) || "")
      };
    })
    .filter((row) => row.segment && row.segment !== "-")
    .filter((row) => row.value > 0 || row.salesValue > 0);
}

function segmentTreemapRows(table, deck) {
  const mapped = segmentSnapshotRows(table)
    .filter((row) => row.segment && row.segment !== "-" && row.value > 0)
    .map((row) => ({
      segment: row.segment,
      value: row.value,
      yoy: row.ovYoy,
      sales: row.sales
    }))
    .sort((a, b) => b.value - a.value);

  if (mapped.length <= 8) return mapped;

  const top = mapped.slice(0, 7);
  const rest = mapped.slice(7);
  const otherValue = rest.reduce((sum, row) => sum + row.value, 0);
  if (otherValue <= 0) return top;

  return [
    ...top,
    {
      segment: "Other segments",
      value: otherValue,
      yoy: "Mixed",
      sales: ""
    }
  ];
}

function splitTreemapItems(items, box) {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], ...box }];

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const half = total / 2;
  let running = 0;
  let splitIndex = 1;
  for (let i = 0; i < items.length - 1; i += 1) {
    const next = running + items[i].value;
    if (Math.abs(half - next) <= Math.abs(half - running) || i === 0) {
      running = next;
      splitIndex = i + 1;
    } else {
      break;
    }
  }

  const first = items.slice(0, splitIndex);
  const second = items.slice(splitIndex);
  const firstTotal = first.reduce((sum, item) => sum + item.value, 0);
  const ratio = total > 0 ? firstTotal / total : 0.5;

  if (box.w >= box.h) {
    const firstW = box.w * ratio;
    return [
      ...splitTreemapItems(first, { x: box.x, y: box.y, w: firstW, h: box.h }),
      ...splitTreemapItems(second, { x: box.x + firstW, y: box.y, w: box.w - firstW, h: box.h })
    ];
  }

  const firstH = box.h * ratio;
  return [
    ...splitTreemapItems(first, { x: box.x, y: box.y, w: box.w, h: firstH }),
    ...splitTreemapItems(second, { x: box.x, y: box.y + firstH, w: box.w, h: box.h - firstH })
  ];
}

function addSegmentTreemap(slide, deck, table, box) {
  const rows = segmentTreemapRows(table, deck);
  const ink = toColor(deck.theme.colors.ink);
  const muted = toColor(deck.theme.colors.muted);
  const border = toColor("#FFFFFF");
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const colors = ["#74C8DC", "#069FC5", "#2BA68D", "#F2D35C", "#43C0A6", "#81DCCB", "#9AA3A4", "#2F6FF2"];

  slide.addText("Share of Total by Segment", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: 0.28,
    fontFace: deck.theme.fonts.body,
    fontSize: 12.5,
    color: ink,
    margin: 0
  });

  const chartBox = { x: box.x, y: box.y + 0.43, w: box.w, h: box.h - 0.43 };
  slide.addShape("rect", {
    ...chartBox,
    line: { color: toColor("#D6DCE8"), pt: 0.8 },
    fill: { color: toColor("#F7F9FC"), transparency: 100 }
  });

  if (!rows.length || total <= 0) {
    slide.addText("No segment order value data available.", {
      x: chartBox.x + 0.2,
      y: chartBox.y + 0.24,
      w: chartBox.w - 0.4,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10,
      color: muted,
      margin: 0
    });
    return;
  }

  const tiles = splitTreemapItems(rows, chartBox);
  tiles.forEach((tile, index) => {
    const gap = 0.012;
    const x = tile.x + gap;
    const y = tile.y + gap;
    const w = Math.max(0.02, tile.w - gap * 2);
    const h = Math.max(0.02, tile.h - gap * 2);
    const share = total > 0 ? (tile.value / total) * 100 : 0;
    const canShowName = w >= 0.76 && h >= 0.34;
    const canShowYoy = w >= 1.05 && h >= 0.7;
    const fontSize = w < 1.2 || h < 0.62 ? 7.2 : 8.9;
    const label = cleanInlineText(tile.segment);
    const titleFontSize = label.length > 22 ? Math.max(6.2, fontSize - 0.9) : fontSize;
    const titleHeight = canShowYoy
      ? Math.min(0.36, Math.max(0.24, h * 0.42))
      : Math.min(0.5, Math.max(0.24, h - 0.18));
    const fill = colors[index % colors.length];

    slide.addShape("rect", {
      x,
      y,
      w,
      h,
      line: { color: border, pt: 1.2 },
      fill: { color: toColor(fill) }
    });

    if (canShowName) {
      slide.addText(label, {
        x: x + 0.08,
        y: y + 0.08,
        w: Math.max(0.1, w - 0.16),
        h: titleHeight,
        fontFace: deck.theme.fonts.heading,
        fontSize: titleFontSize,
        bold: true,
        color: toColor("#FFFFFF"),
        margin: 0,
        fit: "shrink"
      });
    }

    if (canShowYoy) {
      slide.addText(`${tile.yoy} OV YoY`, {
        x: x + 0.08,
        y: y + 0.33,
        w: Math.max(0.1, w - 0.16),
        h: 0.18,
        fontFace: deck.theme.fonts.body,
        fontSize: Math.max(6.8, fontSize - 1.3),
        color: toColor("#FFFFFF"),
        margin: 0,
        fit: "shrink"
      });
    }

    slide.addText(`${Math.round(share)}%`, {
      x: x + 0.08,
      y: y + h - 0.29,
      w: Math.max(0.25, w - 0.16),
      h: 0.22,
      fontFace: deck.theme.fonts.heading,
      fontSize: Math.max(8, fontSize + 0.8),
      bold: true,
      color: toColor("#FFFFFF"),
      margin: 0,
      fit: "shrink"
    });
  });
}

function buildPublisherOverviewSummaryTable(table) {
  const rows = segmentSnapshotRows(table);
  if (!rows.length) {
    return {
      title: "Segment Breakdown",
      columns: ["Segment", "YoY Growth", "Total OV", "Sales"],
      rows: [["-", "-", "-", "-"]],
      colW: [2.9, 1.15, 1.4, 0.95]
    };
  }

  return {
    title: "Segment Breakdown",
    columns: ["Segment", "YoY Growth", "Total OV", "Sales"],
    rows: rows.map((row) => [row.segment, row.ovYoy || "-", row.totalOv || "-", row.sales || "-"]),
    colW: [2.9, 1.15, 1.4, 0.95]
  };
}

function addPublisherOverviewSummaryTable(slide, deck, table, box) {
  const title = cleanInlineText(table?.title || "Segment Breakdown");
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const widths = Array.isArray(table?.colW) && table.colW.length === columns.length
    ? table.colW
    : columns.map(() => 1);
  const widthTotal = widths.reduce((sum, width) => sum + Number(width || 0), 0) || columns.length || 1;
  const colWidths = widths.map((width) => (Number(width || 0) / widthTotal) * box.w);
  const rowCount = Math.max(1, rows.length);
  const headerY = box.y + 0.42;
  const headerH = 0.28;
  const availableH = Math.max(1.2, box.h - 0.68);
  const rowH = Math.min(0.39, Math.max(0.24, availableH / rowCount));
  const lineColor = toColor("#C7CFDB");
  const strongLine = toColor("#A8B4C7");
  const ink = toColor(deck.theme.colors.ink);

  slide.addText(title, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: 0.28,
    fontFace: deck.theme.fonts.heading,
    fontSize: 14.4,
    color: ink,
    margin: 0
  });
  slide.addShape("line", {
    x: box.x,
    y: headerY - 0.06,
    w: box.w,
    h: 0,
    line: { color: strongLine, pt: 0.55 }
  });

  let cursorX = box.x;
  columns.forEach((column, index) => {
    const width = colWidths[index] || 0.8;
    slide.addText(column, {
      x: cursorX + 0.04,
      y: headerY,
      w: Math.max(0.2, width - 0.08),
      h: headerH,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.2,
      bold: true,
      color: ink,
      align: index === 0 ? "left" : "right",
      margin: 0
    });
    cursorX += width;
  });

  slide.addShape("line", {
    x: box.x,
    y: headerY + headerH + 0.02,
    w: box.w,
    h: 0,
    line: { color: strongLine, pt: 0.65 }
  });

  rows.forEach((row, rowIndex) => {
    const rowY = headerY + headerH + 0.1 + rowIndex * rowH;
    let rowX = box.x;
    row.forEach((value, cellIndex) => {
      const width = colWidths[cellIndex] || 0.8;
      slide.addText(cleanInlineText(value || "-"), {
        x: rowX + 0.04,
        y: rowY,
        w: Math.max(0.2, width - 0.08),
        h: rowH - 0.03,
        fontFace: deck.theme.fonts.body,
        fontSize: 9.8,
        color: ink,
        align: cellIndex === 0 ? "left" : "right",
        margin: 0,
        fit: "shrink"
      });
      rowX += width;
    });
    slide.addShape("line", {
      x: box.x,
      y: rowY + rowH - 0.02,
      w: box.w,
      h: 0,
      line: { color: lineColor, pt: 0.45 }
    });
  });
}

function renderSlide(slide, deck, spec, pageNumber) {
  if (spec.kind === "cover") {
    addBlueChrome(slide, deck);
    addSlideWatermark(slide, deck, true);
    addFifthElementWireframe(slide, { x: 8.62, y: 2.52, w: 4.55, h: 4.6 });
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
    const coverMetaLabel = uiLabel(deck, "qbrReport", "QBR Report").toLocaleUpperCase(locale);
    const coverAnalysisLabel = uiLabel(deck, "analysisTagSuffix", "Analysis");
    slide.addText(coverMetaLabel, {
      x: 0.68,
      y: 3.02,
      w: 1.28,
      h: 0.24,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.6,
      color: toColor(deck.theme.colors.paper),
      bold: true,
      margin: 0
    });
    slide.addShape("line", {
      x: 2.03,
      y: 3.02,
      w: 0,
      h: 0.28,
      line: { color: toColor(deck.theme.colors.paper), pt: 0.75, transparency: 45 }
    });
    slide.addText([
      { text: periodTag, options: { color: toColor("#D7E8FF") } },
      { text: " / ", options: { color: toColor("#D7E8FF") } },
      { text: coverAnalysisLabel, options: { color: toColor(deck.theme.colors.paper), bold: true } }
    ], {
      x: 2.18,
      y: 3.02,
      w: 4.5,
      h: 0.24,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.2,
      margin: 0
    });
    slide.addShape("line", {
      x: 0.68,
      y: 3.39,
      w: 4.72,
      h: 0,
      line: { color: toColor(deck.theme.colors.paper), pt: 0.55, transparency: 68 }
    });
    slide.addImage({
      path: TD_WHITE_LOGO_PATH,
      x: 0.62,
      y: 4.22,
      w: 2.5,
      h: 2.02
    });
    return;
  }

  if (spec.kind === "thank-you") {
    addBlueChrome(slide, deck);
    addSlideWatermark(slide, deck, true);
    addFifthElementWireframe(slide, { x: 6.68, y: 0.82, w: 6.05, h: 6.11 });
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
      w: 4.42,
      h: 1.04,
      radius: 0.06,
      line: { color: toColor(deck.theme.colors.paper), pt: 0.35, transparency: 55 },
      fill: { color: toColor(deck.theme.colors.paper), transparency: 42 }
    });
    slide.addText(uiLabel(deck, "anyQuestions", "Any Questions?"), {
      x: 0.95,
      y: 2.84,
      w: 3.75,
      h: 0.34,
      fontFace: deck.theme.fonts.heading,
      fontSize: 17,
      color: toColor(deck.theme.colors.paper),
      align: "left",
      valign: "mid",
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

  if (spec.kind === "publisher-ov-ranking-bars") {
    addPublisherOrderValueBars(slide, deck, spec);
    return;
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

    parsed.slice(0, 5).forEach((item, index) => {
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
      slide.addText(item.title, {
        x: 1.18,
        y,
        w: 11.4,
        h: 0.34,
        fontFace: deck.theme.fonts.heading,
        fontSize: 16,
        color: toColor(deck.theme.colors.paper),
        margin: 0
      });
      slide.addText(item.detail, {
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
    if (spec.tables && spec.tables[0]) {
      addSegmentTreemap(slide, deck, spec.tables[0], { x: 0.35, y: 2.04, w: 5.55, h: 4.72 });
    }
    addPublisherOverviewSummaryTable(
      slide,
      deck,
      spec.summaryTable || buildPublisherOverviewSummaryTable(spec.tables?.[0]),
      { x: 5.95, y: 1.9, w: 6.2, h: 5.0 }
    );
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
      return `${text.slice(0, maxChars - 1).trimEnd()}\u2026`;
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

function normalizeOutputFileName(value, fallback = "qbr_deck") {
  const raw = cleanInlineText(value || fallback);
  const leafName = raw.replace(/\\/g, "/").split("/").pop() || fallback;
  const withoutExtension = leafName.replace(/\.pptx$/i, "");
  return `${safeName(withoutExtension)}.pptx`;
}

async function writeUniqueFile(outputDir, preferredFileName, data, options) {
  const normalizedFileName = normalizeOutputFileName(preferredFileName);
  const extension = path.extname(normalizedFileName) || ".pptx";
  const baseName = normalizedFileName.slice(0, -extension.length);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const fileName = attempt === 0
      ? normalizedFileName
      : `${baseName}_${crypto.randomUUID()}${extension}`;
    const filePath = path.join(outputDir, fileName);
    try {
      await fs.writeFile(filePath, data, { ...options, flag: "wx" });
      return { fileName, filePath };
    } catch (error) {
      if (error && error.code === "EEXIST") continue;
      throw error;
    }
  }

  const fileName = `${baseName}_${crypto.randomUUID()}${extension}`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, data, { ...options, flag: "wx" });
  return { fileName, filePath };
}

async function generatePresentation(payload, options = {}) {
  const normalized = normalizePayload(payload || {});
  const theme = resolveTheme(normalized.themeName, normalized.themeOverrides);
  const deckSpec = buildDeckSpec(normalized, theme);
  const localizedDeckSpec = await localizeDeckSpec(deckSpec, normalized.languageCode);
  const buffer = await renderDeck(localizedDeckSpec);
  const excelBuffer = await buildPublisherRecommendationWorkbook(normalized);
  const requestedFileName = normalized.outputFileName || `${safeName(localizedDeckSpec.metadata.deckTitle)}_${crypto.randomUUID()}.pptx`;
  const fileName = sanitizeOutputFileName(requestedFileName);
  const excelFileName = excelBuffer ? "qbr_deck_publisher_recommendations.xlsx" : null;

  return { normalized, deckSpec: localizedDeckSpec, buffer, fileName, excelBuffer, excelFileName };
}

async function saveOutput(result, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const savedPptx = await writeCreateOnly(fs, outputDir, sanitizeOutputFileName(result.fileName), result.buffer);

  let excelFileName = null;
  if (result.excelBuffer) {
    const preferredExcelName = cleanInlineText(result.excelFileName || "", "")
      || savedPptx.fileName.replace(/\.pptx$/i, "_publisher_recommendations.xlsx");
    const safeExcelName = path.basename(preferredExcelName)
      .replace(/[^a-zA-Z0-9-_. ]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase()
      .replace(/\.xlsx$/i, "") || "publisher_recommendations";
    const savedExcel = await writeCreateOnly(fs, outputDir, `${safeExcelName}.xlsx`, result.excelBuffer);
    excelFileName = savedExcel.fileName;
  }

  let deckSpecFileName = null;
  if (result.normalized.debug) {
    deckSpecFileName = savedPptx.fileName.replace(/\.pptx$/i, ".deck-spec.json");
    const savedDeckSpec = await writeCreateOnly(
      fs,
      outputDir,
      deckSpecFileName,
      JSON.stringify(result.deckSpec, null, 2),
      "utf8"
    );
    deckSpecFileName = savedDeckSpec.fileName;
  }

  return { pptxPath: savedPptx.fullPath, fileName: savedPptx.fileName, deckSpecFileName, excelFileName };
}

module.exports = {
  generatePresentation,
  saveOutput
};

