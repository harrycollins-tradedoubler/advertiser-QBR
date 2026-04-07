const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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
  [/Ã‚Â£|ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£|Ãâ€œÃ¢â‚¬Å¡Ãâ€™ÃË†|ÃË†/g, "\u00A3"],
  [/Ã‚â‚¬|ÃƒÆ’Ã‚Â¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬|Ãâ€œÃ¢â‚¬Å¡Ãâ€™Ã‚Â¤/g, "\u20AC"],
  [/Ã‚Â¥/g, "\u00A5"],
  [/Ã‚/g, ""],
  [/Ã‚Â /g, " "],
  [/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-"],
  [/Ã¢â‚¬Ëœ|Ã¢â‚¬â„¢/g, "'"],
  [/Ã¢â‚¬Å“|Ã¢â‚¬ï¿½/g, '"'],
  [/zÃ…â€š|zÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡/g, "z\u0142"]
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
  newpublisherprospects: "newPublisherProspects"
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

function cleanText(value, fallback = "") {
  const raw = String(value ?? fallback);
  const repaired = TEXT_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), raw);
  return repaired.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanInlineText(value, fallback = "") {
  return cleanText(value, fallback).replace(/\s+/g, " ").trim();
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
  const client = cleanInlineText(payload.client || payload.clientName || "Client");
  const deckTitle = cleanInlineText(payload.deckTitle || `QBR - ${client}`);
  const reportingPeriod = cleanInlineText(payload.reportingPeriod || "Reporting period not provided");
  const comparisonPeriod = cleanInlineText(payload.comparisonPeriod || "Comparison period not provided");
  const qbrFocus = cleanInlineText(payload.qbrFocus || "General performance review");
  const qbrFocusDetail = cleanInlineText(payload.qbrFocusDetail || "");
  const languageCode = cleanInlineText(payload.languageCode || "EN").toUpperCase();
  const languageName = cleanInlineText(payload.languageName || "English");
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
  const analysisProgramIds = Array.from(new Set([
    ...normalizeIdList(payload.analysisProgramIds),
    ...normalizeIdList(payload.publisherProgramIds),
    ...normalizeIdList(payload.programIds),
    cleanInlineText(payload.programId || ""),
    cleanInlineText(payload.publisherProgramId || "")
  ].filter(Boolean)));
  const tables = normalizeTables(payload.publisherTables || {});
  const { metrics, metricMap } = normalizeMetrics(payload.programYoYTable || []);
  const programScopeTable = normalizeProgramScopeTable(
    payload.programScopeTable || payload.programLevelBreakdown || payload.programBreakdownTable
  );

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
    languageCode,
    languageName,
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
  if (c === "PLN") return "z\u0142";
  if (["SEK", "NOK", "DKK", "ISK"].includes(c)) return "kr";
  return "";
}

function formatSignedMoney(value, currencyCode) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  const symbol = getCurrencySymbol(currencyCode);
  const n = Number(value);
  const abs = Math.abs(n);
  const rounded = abs >= 1000 ? Math.round(abs) : Number(abs.toFixed(0));
  const txt = Number(rounded).toLocaleString("en-GB");
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

function parsePeriodRange(reportingPeriod) {
  const text = cleanInlineText(reportingPeriod || "");
  const match = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|\u2013|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (!match) return text || "the current period";

  const start = new Date(`${match[1]}T00:00:00Z`);
  const end = new Date(`${match[2]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return text || "the current period";

  const options = { month: "short", year: "numeric", timeZone: "UTC" };
  const startLabel = start.toLocaleString("en-GB", options);
  const endLabel = end.toLocaleString("en-GB", options);
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

function formatLongDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatCompactDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC"
  }).replace(/\//g, "");
}

function formatPeriodForSlide(periodText) {
  const parsed = parseIsoPeriod(periodText);
  if (!parsed) return cleanInlineText(periodText || "Not specified");
  return `${formatLongDate(parsed.start)} to ${formatLongDate(parsed.end)}`;
}

function buildCoverPeriodTag(periodText) {
  const parsed = parseIsoPeriod(periodText);
  if (!parsed) return "PERIOD";
  return `${formatCompactDate(parsed.start)}-${formatCompactDate(parsed.end)}`;
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
  if (input.executiveSummaryText) return input.executiveSummaryText;

  const m = input.metricMap || {};
  const sales = m.sales || {};
  const clicks = m.clicks || {};
  const conv = m.convrate || {};
  const aov = m.aov || {};
  const ov = m.ordervalue || {};

  const programLabel = cleanInlineText(input.client || "Program");
  const affiliateLabel = /affiliate program/i.test(programLabel)
    ? programLabel
    : `${programLabel} Affiliate Program`;
  const periodLabel = parsePeriodRange(input.reportingPeriod);

  return cleanInlineText(
    `The ${affiliateLabel} delivered mixed results in ${periodLabel}. While AOV grew ${aov.variance || "N/A"} to ${aov.current || "-"} and conversion rate improved ${conv.variance || "N/A"}, total sales declined ${sales.variance || "N/A"} YoY driven by a ${clicks.variance || "N/A"} reduction in click volume. Total order value ${movementVerb(ov)} ${ov.variance || "N/A"} to ${ov.current || "-"}. Full KPI breakdown follows on the next slides.`
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
    "Program",
    "Market",
    "Clicks",
    "Impressions",
    "Sales",
    "Conversion Rate",
    "AOV",
    "Total Order Value",
    "YoY Change"
  ];

  const scope = input.programScopeTable;
  if (scope && Array.isArray(scope.rows) && scope.rows.length) {
    const idx = Object.fromEntries((scope.columns || []).map((col, i) => [cleanInlineText(col).toLowerCase(), i]));
    const rows = scope.rows.map((row) => {
      const programId = row[idx["program id"]] || "-";
      const program = row[idx.program] || `Program ${programId}`;
      const sales = row[idx["current sales"]] || "-";
      const totalOv = row[idx["current ov"]] || "-";
      const yoy = row[idx["ov yoy %"]] || row[idx["sales yoy %"]] || "-";
      return [programId, program, "-", "-", "-", sales, "-", "-", totalOv, yoy];
    });
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
      rows: input.analysisProgramIds.map((id) => [id, `Program ${id}`, "-", "-", "-", "-", "-", "-", "-", "-"]),
      dense: false
    };
  }

  return {
    title: "Program-Level Breakdown",
    columns: targetColumns,
    rows: [["-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]],
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

function buildPublisherOverviewBullets(input) {
  const isNarrativeCandidate = (line) => {
    const text = cleanInlineText(line);
    if (!text || text.length < 30 || text.length > 260) return false;
    if (/\bsite\s*id\b/i.test(text)) return false;
    if (/\bcurrent sales:\b|\bcurrent ov:\b|\bov yoy change:\b|\bsales yoy %:\b/i.test(text)) return false;
    if (/^(voucher|cashback|other|content|css)\s*[-—]/i.test(text)) return false;
    if (/\btotal sales:\b|\btotal ov:\b|\bpublishers:\b/i.test(text)) return false;
    if (/^\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i.test(text)) return false;
    if (/\|\s/.test(text)) return false;
    return true;
  };

  const pickNarrativeBullets = (lines, limit = 4) => {
    const seen = new Set();
    const out = [];
    for (const line of lines || []) {
      const text = cleanInlineText(line);
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
    const pub = cleanInlineText(topGrowthRow.Publisher || "Top growth publisher");
    const seg = cleanInlineText(topGrowthRow.Segment || "N/A");
    const ovDelta = cleanInlineText(topGrowthRow["OV YoY Change"] || "N/A");
    const ovPct = cleanInlineText(topGrowthRow["OV YoY %"] || "N/A");
    obs.push(`${pub} drove the strongest YoY uplift (${seg}), adding ${ovDelta} in OV (${ovPct}).`);
  }

  const topDeclineRow = decline?.rows?.[0];
  if (topDeclineRow) {
    const pub = cleanInlineText(topDeclineRow.Publisher || "Top declining publisher");
    const seg = cleanInlineText(topDeclineRow.Segment || "N/A");
    const ovDelta = cleanInlineText(topDeclineRow["OV YoY Change"] || "N/A");
    const ovPct = cleanInlineText(topDeclineRow["OV YoY %"] || "N/A");
    obs.push(`${pub} recorded the largest decline (${seg}), with OV movement ${ovDelta} (${ovPct}).`);
  }

  if (brandNew?.rows?.length) {
    const totalOv = brandNew.rows.reduce((sum, row) => sum + (parseNumber(row["Current OV"]) || 0), 0);
    obs.push(`${brandNew.rows.length} brand-new publishers were activated, contributing ${getCurrencySymbol(input.currencyCode)}${Math.round(totalOv).toLocaleString("en-GB")} in combined OV.`);
  }

  if (current?.rows?.length) {
    const top2 = current.rows.slice(0, 2).map((row) => ({
      name: cleanInlineText(row.Publisher || "Publisher"),
      ov: parseNumber(row["Order Value"] || row["Current OV"] || row["Current Order Value"])
    }));
    if (top2.length === 2) {
      const top2Ov = top2.reduce((sum, item) => sum + (item.ov || 0), 0);
      const totalOv = (segment?.rows || []).reduce((sum, row) => sum + (parseNumber(row["Total OV"]) || 0), 0);
      const share = totalOv > 0 ? ` (${((top2Ov / totalOv) * 100).toFixed(1)}% of programme OV)` : "";
      obs.push(`Publisher concentration remains high: ${top2[0].name} and ${top2[1].name} account for ${getCurrencySymbol(input.currencyCode)}${Math.round(top2Ov).toLocaleString("en-GB")}${share}.`);
    }
  }

  const computed = pickNarrativeBullets(obs, 4);
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

  const iconBySegment = {
    voucher: "\uD83D\uDE80",
    cashback: "\uD83D\uDCB3",
    other: "\uD83D\uDCC9",
    content: "\uD83D\uDCCA",
    css: "\u26A0"
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
    publisher: cleanInlineText(row.Publisher || ""),
    salesCurrent: cleanInlineText(row["Current Sales"] || ""),
    salesPct: cleanInlineText(row["Sales YoY %"] || ""),
    ovDelta: cleanInlineText(row["OV YoY Change"] || ""),
    ovPct: cleanInlineText(row["OV YoY %"] || "")
  }));

  const declineRows = (input.tables.topDecliningPublishers?.rows || []).map((row) => ({
    segment: cleanInlineText(row.Segment || ""),
    publisher: cleanInlineText(row.Publisher || ""),
    salesCurrent: cleanInlineText(row["Current Sales"] || ""),
    salesPct: cleanInlineText(row["Sales YoY %"] || ""),
    ovDelta: cleanInlineText(row["OV YoY Change"] || ""),
    ovPct: cleanInlineText(row["OV YoY %"] || "")
  }));
  const currentRows = (input.tables.topCurrentPerformers?.rows || []).map((row) => ({
    segment: cleanInlineText(row.Segment || ""),
    publisher: cleanInlineText(row.Publisher || ""),
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
    const detail = aiDetail && aiDetail.length > defaultDetail.length * 0.6
      ? `${defaultDetail} ${aiDetail}`
      : defaultDetail;
    return `${icon} ${row.segment} - ${row.ovYoy} OV YoY\n${detail}`;
  });
}

function formatSignedCount(value) {
  if (value === null || value === undefined) return "N/A";
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  const rounded = Math.round(n);
  const abs = Math.abs(rounded).toLocaleString("en-GB");
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
      detail: `Programme conversion rate moved from ${cleanInlineText(m.convrate?.previous || "N/A")} to ${cleanInlineText(m.convrate?.current || "N/A")} (${cleanInlineText(m.convrate?.variance || "N/A")}). Sales changed ${formatSignedCount(parseNumber(m.sales?.difference))} while clicks changed ${formatSignedCount(parseNumber(m.clicks?.difference))}, indicating the quality shift in converting traffic.`
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
    const publisher = compactLabel(readTableCell(row, ["Publisher"]), 36);
    const siteId = readTableCell(row, ["Site ID", "SiteID", "Site Id"]);
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

  const moversSales = input.tables.moversSales;
  const topUp = getTopDirection(moversSales, "Up");
  const topDown = getTopDirection(moversSales, "Down");

  const bullets = [
    `Conversion Efficiency: ${metricSentence("Conversion rate", conv)} Clicks ${directionWord(clicks?.varianceValue)} ${clicks?.variance || "N/A"} while sales ${directionWord(sales?.varianceValue)} ${sales?.variance || "N/A"}.`,
    `Basket vs Volume: ${metricSentence("AOV", aov)} Total order value ${directionWord(ov?.varianceValue)} ${ov?.variance || "N/A"} (${ov?.difference || "-"}) despite transaction movement.`,
    `Cost Control: ${metricSentence("CPA", cpa)} Publisher commission moved ${m.publcommission?.variance || "N/A"} YoY.`,
    `Return: ${metricSentence("ROI", roi)} This reflects order value generated per unit of commission spend.`,
    topUp || topDown
      ? `Publisher Signal: strongest Sales mover ${topUp || "N/A"}; largest decline ${topDown || "N/A"}.`
      : "Publisher Signal: driver not confirmed from available publisher mover data."
  ];

  return bullets.map((line) => cleanInlineText(line)).slice(0, 5);
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
  const declineTable = input.tables.moversOrderValue || input.tables.moversSales || input.tables.topDecliningPublishers;
  const ranked = tableRowsWithRank(declineTable, 5);
  if (!ranked || !ranked.rows.length) {
    return [
      ["Publisher concentration risk", "High", "Medium", "Diversify publisher mix and reduce top-publisher dependency."],
      ["Rising CPA trend", "High", "High", "Review commission structure and tighten cost controls."],
      ["Traffic decline", "Medium", "High", "Investigate source quality and reactivate top contributors."]
    ];
  }

  const publisherIndex = ranked.columns.findIndex((column) => column.toLowerCase().includes("publisher"));
  return ranked.rows.slice(0, 5).map((row) => {
    const publisher = publisherIndex > -1 ? row[publisherIndex] : "Publisher";
    return [
      `${publisher} performance risk`,
      "High",
      "Medium",
      "Validate root cause and agree a short-cycle recovery plan."
    ];
  });
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
    title: input.deckTitle,
    subtitle: reportingSummary,
    headline,
    summary: input.qbrFocusDetail ? `${input.qbrFocus}. ${input.qbrFocusDetail}` : input.qbrFocus,
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
            dense: false
          }
        ]
      : []
  });

  slides.push({
    id: "segment-performance",
    kind: "segment-performance",
    title: "Publisher Segment Performance",
    subtitle: "Year-over-year order value performance broken down by publisher segment, revealing growth and decline patterns.",
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
    subtitle: "Key risks to program performance and mitigation actions.",
    bullets: [],
    kpis: [],
    tables: [
      {
        title: "Risks & Dependencies",
        columns: ["Risk", "Impact", "Likelihood", "Mitigation"],
        rows: buildRiskRows(input),
        dense: false
      }
    ]
  });

  slides.push({
    id: "thank-you",
    kind: "thank-you",
    title: `${input.client} Thank you.`,
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
      currencyCode: input.currencyCode,
      qbrFocus: input.qbrFocus,
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

function cellTextColor(table, column, value, deck) {
  if (!isDeltaColumn(column)) return toColor(deck.theme.colors.ink);
  const text = cleanInlineText(value);
  if (text.startsWith("+")) return toColor(deck.theme.colors.success);
  if (text.startsWith("-")) return toColor(deck.theme.colors.accentAlt);
  return toColor(deck.theme.colors.ink);
}

function addTable(slide, deck, table, box, mode = "light") {
  const innerX = box.x + 0.12;
  const innerY = box.y + 0.10;
  const innerW = box.w - 0.24;
  const innerH = box.h - 0.20;

  const header = table.columns.map((column) => ({
    text: column,
    options: {
      bold: true,
      fontFace: deck.theme.fonts.body,
      fontSize: table.dense ? 9 : 10.5,
      color: toColor(deck.theme.colors.ink),
      fill: { color: toColor("#F1F3F7") },
      margin: 0.045,
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

    return row.map((value, cellIndex) => ({
      text: value,
      options: {
        bold: isSectionRow,
        fontFace: deck.theme.fonts.body,
        fontSize: table.dense ? 9 : (isSectionRow ? 10.5 : 10),
        color: isSectionRow
          ? toColor(deck.theme.colors.ink)
          : cellTextColor(table, table.columns[cellIndex] || "", value, deck),
        fill: { color: toColor(rowFill) },
        margin: 0.045,
        valign: "mid"
      }
    }));
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
    const periodTag = buildCoverPeriodTag(deck.metadata.reportingPeriod);
    slide.addText(cleanInlineText(spec.title), {
      x: 0.68,
      y: 1.25,
      w: 10.6,
      h: 0.95,
      fontFace: deck.theme.fonts.heading,
      fontSize: 31,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    if (spec.subtitle) {
      slide.addText(cleanInlineText(spec.subtitle), {
        x: 0.68,
        y: 2.3,
        w: 10.2,
        h: 0.28,
        fontFace: deck.theme.fonts.body,
        fontSize: 13,
        color: toColor(deck.theme.colors.paper),
        margin: 0
      });
    }
    slide.addShape("roundRect", {
      x: 0.68,
      y: 3.25,
      w: 1.28,
      h: 0.36,
      radius: 0.04,
      line: { color: toColor(deck.theme.colors.paper), pt: 0 },
      fill: { color: toColor(deck.theme.colors.paper), transparency: 25 }
    });
    slide.addText("QBR REPORT", {
      x: 0.83,
      y: 3.33,
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
      y: 3.25,
      w: 2.65,
      h: 0.36,
      radius: 0.04,
      line: { color: toColor(deck.theme.colors.accent), pt: 0.8 },
      fill: { color: toColor(deck.theme.colors.accent), transparency: 100 }
    });
    slide.addText(`${periodTag} ANALYSIS`, {
      x: 2.18,
      y: 3.33,
      w: 2.35,
      h: 0.2,
      fontFace: deck.theme.fonts.body,
      fontSize: 8.5,
      color: toColor("#80D4FF"),
      bold: true,
      margin: 0
    });
    if (spec.summary) {
      slide.addText(spec.summary, {
        x: 0.68,
        y: 2.73,
        w: 10.2,
        h: 0.45,
        fontFace: deck.theme.fonts.body,
        fontSize: 11.5,
        color: toColor(deck.theme.colors.paper),
        margin: 0
      });
    }
    slide.addText("tradedoubler", {
      x: 0.68,
      y: 5.88,
      w: 4.1,
      h: 0.48,
      fontFace: deck.theme.fonts.heading,
      fontSize: 28,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    return;
  }

  if (spec.kind === "thank-you") {
    addBlueChrome(slide, deck);
    addSlideWatermark(slide, deck, true);
    slide.addText(spec.title, {
      x: 0.6,
      y: 0.55,
      w: 8.6,
      h: 0.5,
      fontFace: deck.theme.fonts.heading,
      fontSize: 30,
      color: toColor(deck.theme.colors.paper),
      margin: 0
    });
    slide.addShape("roundRect", {
      x: 0.3,
      y: 1.25,
      w: 12.73,
      h: 5.75,
      radius: 0.06,
      line: { color: toColor(deck.theme.colors.paper), pt: 0 },
      fill: { color: toColor(deck.theme.colors.paper), transparency: 0 }
    });
    slide.addText("Any Questions?", {
      x: 0.6,
      y: 1.8,
      w: 4.8,
      h: 0.6,
      fontFace: deck.theme.fonts.heading,
      fontSize: 30,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addText(`TD Affiliate Program - ${deck.metadata.reportingPeriod} Quarterly Business Review`, {
      x: 0.6,
      y: 2.58,
      w: 7.6,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 11,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    addBullets(slide, deck, [
      "Confirm action owners and deadlines",
      "Share this report with stakeholders",
      "Schedule next QBR checkpoint"
    ], { x: 0.6, y: 3.2, w: 5.0, h: 2.0 }, deck.theme.colors.ink);
    addBullets(slide, deck, [
      `Prepared by: ${deck.metadata.client} team`,
      "Role: Affiliate Program",
      `Date: ${deck.metadata.reportingPeriod}`
    ], { x: 5.8, y: 3.2, w: 5.8, h: 1.8 }, deck.theme.colors.ink);
    slide.addText("td", {
      x: 0.65,
      y: 5.55,
      w: 1.5,
      h: 0.95,
      fontFace: deck.theme.fonts.heading,
      fontSize: 86,
      color: toColor(deck.theme.colors.accent),
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
    const currentPeriodReadable = formatPeriodForSlide(deck.metadata.reportingPeriod);
    const comparisonPeriodReadable = formatPeriodForSlide(deck.metadata.comparisonPeriod);
    const currentPeriodParsed = parseIsoPeriod(deck.metadata.reportingPeriod);
    const asOfLabel = currentPeriodParsed ? formatLongDate(currentPeriodParsed.end) : "N/A";
    const currencySymbol = getCurrencySymbol(deck.metadata.currencyCode);
    const currencyLabel = currencySymbol
      ? `${deck.metadata.currencyCode} (${currencySymbol})`
      : deck.metadata.currencyCode;

    slide.addText("Current Period", {
      x: 0.7,
      y: 2.0,
      w: 5.6,
      h: 0.4,
      fontFace: deck.theme.fonts.heading,
      fontSize: 21,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addText("Comparison Period (YoY)", {
      x: 6.9,
      y: 2.0,
      w: 5.6,
      h: 0.4,
      fontFace: deck.theme.fonts.heading,
      fontSize: 21,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addText(`Reporting Period: ${currentPeriodReadable}`, {
      x: 0.7,
      y: 2.55,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText(`Data as of: ${asOfLabel}`, {
      x: 0.7,
      y: 2.86,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText(`Comparison Period: ${comparisonPeriodReadable}`, {
      x: 6.9,
      y: 2.55,
      w: 5.8,
      h: 0.3,
      fontFace: deck.theme.fonts.body,
      fontSize: 10.8,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText("Basis: Year-over-Year (YoY)", {
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
    slide.addText(`\u25AD  All figures are reported in ${currencyLabel} unless otherwise stated. YoY variance is calculated as Current Period vs Comparison Period.`, {
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
    const insightItems = (spec.bullets || []).slice(0, 5);
    const leftItems = insightItems.slice(0, 3);
    const rightItems = insightItems.slice(3, 5);

    slide.addShape("line", {
      x: 6.63,
      y: 2.0,
      w: 0,
      h: 4.7,
      line: { color: toColor("#90B1FF"), pt: 1.2 }
    });
    [2.4, 3.55, 4.7, 5.85].forEach((y) => {
      slide.addShape("ellipse", {
        x: 6.57,
        y,
        w: 0.12,
        h: 0.12,
        line: { color: toColor("#90B1FF"), pt: 0 },
        fill: { color: toColor("#90B1FF") }
      });
    });

    leftItems.forEach((item, index) => {
      const y = 2.05 + index * 1.55;
      slide.addText(`\u2022 ${item}`, {
        x: 0.75,
        y,
        w: 5.55,
        h: 1.35,
        align: "left",
        fontFace: deck.theme.fonts.body,
        fontSize: 12.5,
        color: toColor(deck.theme.colors.paper),
        breakLine: true,
        margin: 0.02
      });
    });

    rightItems.forEach((item, index) => {
      const y = 3.18 + index * 1.7;
      slide.addText(`\u2022 ${item}`, {
        x: 7.0,
        y,
        w: 5.55,
        h: 1.5,
        align: "left",
        fontFace: deck.theme.fonts.body,
        fontSize: 12.5,
        color: toColor(deck.theme.colors.paper),
        breakLine: true,
        margin: 0.02
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
    let overviewTableMetrics = null;
    slide.addText("Publisher Activity by Segment", {
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
    slide.addText("Key Observations", {
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
    slide.addText(notes.map((item) => `\u2022 ${item}`).join("\n\n"), {
      x: 6.28,
      y: 2.56,
      w: 5.25,
      h: 4.55,
      fontFace: deck.theme.fonts.body,
      fontSize: 11.6,
      color: toColor(deck.theme.colors.ink),
      breakLine: true,
      margin: 0.02
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
    const layout = [
      { x: 0.56, y: 2.02, w: 5.85, h: 1.82 },
      { x: 6.82, y: 2.02, w: 5.85, h: 1.82 },
      { x: 0.56, y: 3.96, w: 5.85, h: 1.82 },
      { x: 6.82, y: 3.96, w: 5.85, h: 1.82 },
      { x: 0.56, y: 5.90, w: 5.85, h: 1.30 }
    ];
    layout.forEach((box, idx) => {
      const raw = cleanText(blocks[idx] || "Segment signal not available.");
      const lines = raw.split(/\r?\n/).map((line) => cleanInlineText(line)).filter(Boolean);
      const heading = lines[0] || "Segment";
      const detail = lines.slice(1).join(" ") || "Detailed movement not available from this extract.";
      const headingMatch = heading.match(/^(.+?)\s*-\s*([+-]?\d+(?:[.,]\d+)?%.*)$/i);
      const headingPrefix = headingMatch ? headingMatch[1].trim() : heading;
      const headingSuffix = headingMatch ? headingMatch[2].trim() : "";

      slide.addShape("roundRect", {
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        radius: 0.04,
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
        h: 0.34,
        fontFace: deck.theme.fonts.heading,
        fontSize: 12.5,
        margin: 0
      });
      slide.addText(detail, {
        x: box.x + 0.22,
        y: box.y + 0.50,
        w: box.w - 0.36,
        h: box.h - 0.62,
        fontFace: deck.theme.fonts.body,
        fontSize: 10.2,
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
  const buffer = await renderDeck(deckSpec);
  const fileName = normalized.outputFileName || `${safeName(deckSpec.metadata.deckTitle)}_${crypto.randomUUID()}.pptx`;

  return { normalized, deckSpec, buffer, fileName };
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

