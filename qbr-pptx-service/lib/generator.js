const fs = require("node:fs/promises");
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

const TEXT_REPLACEMENTS = [
  [/Â£|Ãƒâ€šÃ‚Â£|Ð“â€šÐ’Ðˆ|Ðˆ/g, "£"],
  [/Â€|ÃƒÂ¢â‚¬Å¡Ã‚Â¬|Ð“â€šÐ’Â¤/g, "€"],
  [/Â¥/g, "¥"],
  [/Â /g, " "],
  [/â€“|â€”/g, "-"],
  [/â€˜|â€™/g, "'"],
  [/â€œ|â€�/g, '"'],
  [/zÅ‚|zÃƒâ€¦Ã¢â‚¬Å¡/g, "zł"]
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
    heading: "Aptos",
    body: "Aptos",
    mono: "Aptos"
  },
  colors: {
    ink: "#000000",
    paper: "#FFFFFF",
    canvas: "#ECE9E3",
    accent: "#2B73FF",
    accentAlt: "#FFABEE",
    success: "#2CC87F",
    warning: "#FFD332",
    highlight: "#FFABEE",
    muted: "#6F6B66",
    border: "#D7D2CA"
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
  text = text.replace(/[£€$¥]|zł|kr/gi, "").replace(/\s+/g, "");
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
  if (/[£€$¥]|zł|kr/i.test(value) || key.includes("value") || key.includes("commission") || key.includes("cpa")) return "currency";
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
  const currencyCode = cleanInlineText(payload.currencyCode || "GBP").toUpperCase();
  const programOutput = cleanText(payload.programOutput || "");
  const publisherAnalysis = cleanText(payload.publisherAnalysis || "");
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
    includeAppendix: payload.includeAppendix !== false,
    debug: payload.debug === true,
    outputFileName: cleanInlineText(payload.outputFileName || ""),
    recommendations: normalizeRecommendations(payload.recommendations),
    programSections: parseSections(programOutput),
    publisherSections: parseSections(publisherAnalysis),
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
  return {
    label: metric.label,
    value: metric.current,
    delta: metric.variance,
    trend: trend(metric)
  };
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

function buildDeckSpec(input, theme) {
  const slides = [];
  const headline = buildHeadline(input);
  const topCards = ["sales", "ordervalue", "aov", "clicks", "convrate", "roi"]
    .map((key) => metricCard(input.metricMap[key]))
    .filter(Boolean)
    .slice(0, 6);

  slides.push({
    id: "cover",
    kind: "cover",
    title: input.deckTitle,
    subtitle: `${input.reportingPeriod} vs ${input.comparisonPeriod}`,
    headline,
    summary: input.qbrFocusDetail ? `${input.qbrFocus}. ${input.qbrFocusDetail}` : input.qbrFocus,
    bullets: [`Client: ${input.client}`, `Language: ${input.languageName}`, `Currency: ${input.currencyCode}`],
    kpis: [],
    tables: []
  });

  slides.push({
    id: "executive-summary",
    kind: "executive-summary",
    title: "Executive Summary",
    headline,
    summary: `${input.reportingPeriod} vs ${input.comparisonPeriod}. Focus: ${input.qbrFocus}${input.qbrFocusDetail ? `: ${input.qbrFocusDetail}` : ""}.`,
    bullets: defaultBullets(input),
    kpis: topCards.slice(0, 3),
    tables: []
  });

  if (topCards.length) {
    slides.push({
      id: "kpi-snapshot",
      kind: "kpi-snapshot",
      title: "KPI Snapshot",
      subtitle: `${input.reportingPeriod} vs ${input.comparisonPeriod}`,
      bullets: [],
      kpis: topCards,
      tables: []
    });
  }

  if (input.programScopeTable && input.programScopeTable.rows.length) {
    slides.push({
      id: "program-level-breakdown",
      kind: "program-breakdown",
      title: "Program-Level Breakdown",
      subtitle: `${input.reportingPeriod} vs ${input.comparisonPeriod}`,
      bullets: [],
      kpis: [],
      tables: [
        {
          title: input.programScopeTable.title,
          columns: input.programScopeTable.columns,
          rows: input.programScopeTable.rows,
          dense: false
        }
      ]
    });
  }

  const varianceMetrics = ["sales", "ordervalue", "aov", "clicks", "convrate", "publcommission", "cpa", "roi"]
    .map((key) => input.metricMap[key])
    .filter((item) => item && item.varianceValue !== null && item.varianceValue !== undefined)
    .slice(0, 6);

  if (!input.programScopeTable && (input.programSections.length || varianceMetrics.length)) {
    slides.push({
      id: "program-overview",
      kind: "program-overview",
      title: "Program Performance Overview",
      headline,
      bullets: input.programSections.flatMap((section) => section.bullets).slice(0, 5),
      kpis: [],
      chart: varianceMetrics.length
        ? {
            title: "YoY variance by KPI",
            type: "bar",
            categories: varianceMetrics.map((metric) => metric.label),
            values: varianceMetrics.map((metric) => Number(metric.varianceValue || 0))
          }
        : null,
      tables: []
    });
  }

  const tableSpecs = [
    ["topGrowthPublishers", "top-growth-publishers", "Top Growth Publishers"],
    ["topDecliningPublishers", "top-declining-publishers", "Top Declining Publishers"],
    ["topCurrentPerformers", "top-current-performers", "Top Current Performers by Order Value"],
    ["segmentSnapshot", "segment-snapshot", "Segment Snapshot"],
    ["moversSales", "movers-shakers", "Movers & Shakers: Sales"],
    ["moversOrderValue", "movers-shakers", "Movers & Shakers: Order Value"],
    ["moversClicks", "movers-shakers", "Movers & Shakers: Clicks"],
    ["moversAov", "movers-shakers", "Movers & Shakers: AOV"]
  ];

  for (const [key, kind, title] of tableSpecs) {
    const table = input.tables[key];
    if (!table || !table.rows.length) continue;
    const rows = table.rows.map((row) => table.columns.map((column) => row[column] || "-"));
    slides.push({
      id: key,
      kind,
      title,
      bullets: [],
      kpis: [],
      tables: [
        {
          title,
          columns: table.columns,
          rows,
          dense: key !== "segmentSnapshot"
        }
      ]
    });
  }

  if (input.recommendations.length) {
    slides.push({
      id: "recommendations",
      kind: "recommendations",
      title: "Recommendations",
      headline: "Recommended next steps",
      bullets: input.recommendations.slice(0, 5),
      kpis: [],
      tables: []
    });
  }

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

function addFooter(slide, deck, pageNumber) {
  slide.addShape("line", {
    x: 0.66,
    y: 7.04,
    w: 12,
    h: 0,
    line: { color: toColor(deck.theme.colors.border), pt: 0.8 }
  });
  slide.addText(deck.theme.logoText, {
    x: 0.7,
    y: 7.07,
    w: 2.3,
    h: 0.2,
    fontFace: deck.theme.fonts.body,
    fontSize: 8,
    color: toColor(deck.theme.colors.muted),
    margin: 0
  });
  slide.addText(String(pageNumber), {
    x: 12.1,
    y: 7.03,
    w: 0.5,
    h: 0.25,
    align: "right",
    fontFace: deck.theme.fonts.body,
    fontSize: 8,
    color: toColor(deck.theme.colors.muted),
    margin: 0
  });
}

function addChrome(slide, deck, pageNumber) {
  slide.background = { color: toColor(deck.theme.colors.paper) };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.18,
    line: { color: toColor(deck.theme.colors.accent), pt: 0 },
    fill: { color: toColor(deck.theme.colors.accent) }
  });
  slide.addShape("rect", {
    x: 11.85,
    y: 0.36,
    w: 0.82,
    h: 0.16,
    line: { color: toColor(deck.theme.colors.highlight), pt: 0 },
    fill: { color: toColor(deck.theme.colors.highlight) }
  });
  slide.addShape("rect", {
    x: 12.72,
    y: 0.36,
    w: 0.22,
    h: 0.16,
    line: { color: toColor(deck.theme.colors.warning), pt: 0 },
    fill: { color: toColor(deck.theme.colors.warning) }
  });
  addFooter(slide, deck, pageNumber);
}

function addTitle(slide, deck, spec) {
  slide.addText(spec.title, {
    x: 0.72,
    y: 0.48,
    w: 8.8,
    h: 0.48,
    fontFace: deck.theme.fonts.heading,
    fontSize: 22,
    color: toColor(deck.theme.colors.ink),
    margin: 0
  });
  if (spec.subtitle) {
    slide.addText(spec.subtitle, {
      x: 0.72,
      y: 0.98,
      w: 8.5,
      h: 0.28,
      fontFace: deck.theme.fonts.body,
      fontSize: 10,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
  }
}

function addBullets(slide, deck, bullets, box) {
  if (!bullets || !bullets.length) return;
  slide.addText(bullets.map((item) => `• ${item}`).join("\n"), {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fontFace: deck.theme.fonts.body,
    fontSize: 12,
    color: toColor(deck.theme.colors.ink),
    breakLine: true,
    margin: 0.06
  });
}

function addKpis(slide, deck, cards, origin) {
  const visible = (cards || []).slice(0, 6);
  const columns = 3;
  const cardW = 1.95;
  const cardH = 1.16;
  const gapX = 0.22;
  const gapY = 0.18;
  visible.forEach((card, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = origin.x + col * (cardW + gapX);
    const y = origin.y + row * (cardH + gapY);
    const trendColor = card.trend === "up" ? deck.theme.colors.success : card.trend === "down" ? deck.theme.colors.accentAlt : deck.theme.colors.muted;

    slide.addShape("roundRect", {
      x,
      y,
      w: cardW,
      h: cardH,
      line: { color: toColor(deck.theme.colors.border), pt: 0.7 },
      fill: { color: toColor(deck.theme.colors.canvas) }
    });
    slide.addText(card.label, {
      x: x + 0.16,
      y: y + 0.14,
      w: cardW - 0.3,
      h: 0.18,
      fontFace: deck.theme.fonts.body,
      fontSize: 9,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
    slide.addText(card.value, {
      x: x + 0.16,
      y: y + 0.36,
      w: cardW - 0.3,
      h: 0.34,
      fontFace: deck.theme.fonts.heading,
      fontSize: 18,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    if (card.delta) {
      slide.addText(card.delta, {
        x: x + 0.16,
        y: y + 0.82,
        w: cardW - 0.3,
        h: 0.18,
        fontFace: deck.theme.fonts.body,
        fontSize: 9,
        color: toColor(trendColor),
        margin: 0
      });
    }
  });
}

function addChart(slide, deck, chart) {
  if (!chart) return;
  slide.addChart("bar", [
    {
      name: "YoY %",
      labels: chart.categories,
      values: chart.values
    }
  ], {
    x: 6.78,
    y: 1.4,
    w: 5.62,
    h: 3.9,
    chartColors: [toColor(deck.theme.colors.accent)],
    showLegend: false,
    showTitle: Boolean(chart.title),
    title: chart.title,
    catAxisLabelFontFace: deck.theme.fonts.body,
    catAxisLabelFontSize: 9,
    valAxisLabelFontFace: deck.theme.fonts.body,
    valAxisLabelFontSize: 9
  });
}

function addTable(slide, deck, table, box) {
  const header = table.columns.map((column) => ({
    text: column,
    options: {
      bold: true,
      fontFace: deck.theme.fonts.body,
      fontSize: table.dense ? 9 : 10,
      color: toColor(deck.theme.colors.paper),
      fill: { color: toColor(deck.theme.colors.ink) },
      margin: 0.04
    }
  }));
  const bodyRows = table.rows.map((row, index) =>
    row.map((value) => ({
      text: value,
      options: {
        fontFace: deck.theme.fonts.body,
        fontSize: table.dense ? 8 : 9,
        color: toColor(deck.theme.colors.ink),
        fill: { color: toColor(index % 2 === 0 ? deck.theme.colors.paper : deck.theme.colors.canvas) },
        margin: 0.04
      }
    }))
  );

  if (table.title) {
    slide.addText(table.title, {
      x: box.x,
      y: box.y - 0.24,
      w: box.w,
      h: 0.18,
      fontFace: deck.theme.fonts.body,
      fontSize: 10,
      color: toColor(deck.theme.colors.muted),
      margin: 0
    });
  }

  slide.addTable([header, ...bodyRows], {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    border: { type: "solid", color: toColor(deck.theme.colors.border), pt: 0.6 },
    margin: 0.02,
    autoFit: false
  });
}

function renderSlide(slide, deck, spec, pageNumber) {
  if (spec.kind === "cover") {
    slide.background = { color: toColor(deck.theme.colors.paper) };
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      line: { color: toColor(deck.theme.colors.paper), pt: 0 },
      fill: { color: toColor(deck.theme.colors.paper) }
    });
    slide.addShape("rect", {
      x: 8.95,
      y: 0,
      w: 4.38,
      h: 7.5,
      line: { color: toColor(deck.theme.colors.canvas), pt: 0 },
      fill: { color: toColor(deck.theme.colors.canvas) }
    });
    slide.addShape("ellipse", {
      x: 9.32,
      y: 0.68,
      w: 2.25,
      h: 2.25,
      line: { color: toColor(deck.theme.colors.accent), pt: 0 },
      fill: { color: toColor(deck.theme.colors.accent), transparency: 16 }
    });
    slide.addText(deck.theme.logoText, {
      x: 0.78,
      y: 0.58,
      w: 2.3,
      h: 0.22,
      fontFace: deck.theme.fonts.body,
      fontSize: 11,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    slide.addText(spec.title, {
      x: 0.78,
      y: 1.44,
      w: 7.35,
      h: 0.95,
      fontFace: deck.theme.fonts.heading,
      fontSize: 28,
      color: toColor(deck.theme.colors.ink),
      margin: 0
    });
    if (spec.subtitle) {
      slide.addText(spec.subtitle, {
        x: 0.82,
        y: 2.48,
        w: 6.6,
        h: 0.24,
        fontFace: deck.theme.fonts.body,
        fontSize: 10,
        color: toColor(deck.theme.colors.muted),
        margin: 0
      });
    }
    if (spec.headline) {
      slide.addText(spec.headline, {
        x: 0.82,
        y: 3.04,
        w: 6.4,
        h: 0.72,
        fontFace: deck.theme.fonts.heading,
        fontSize: 22,
        color: toColor(deck.theme.colors.accent),
        margin: 0
      });
    }
    if (spec.summary) {
      slide.addText(spec.summary, {
        x: 0.82,
        y: 3.9,
        w: 5.5,
        h: 0.45,
        fontFace: deck.theme.fonts.body,
        fontSize: 12,
        color: toColor(deck.theme.colors.ink),
        margin: 0
      });
    }
    addBullets(slide, deck, spec.bullets, { x: 0.82, y: 4.68, w: 5.4, h: 1.48 });
    return;
  }

  addChrome(slide, deck, pageNumber);
  addTitle(slide, deck, spec);

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
    } else if (spec.chart) {
      addChart(slide, deck, spec.chart);
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
