const fs = require("node:fs/promises");
const path = require("node:path");

const { createAdvertiserQbrAgent } = require("./advertiserQbrAgent");

const DEFAULT_GENERATOR_URL = process.env.ADVERTISER_QBR_GENERATOR_URL || "http://127.0.0.1:3011/generate";
const DEFAULT_PPTX_API_KEY = process.env.QBR_PPTX_API_KEY || "td-qbr-pptx-local-2026-secret";
const TD_BASE_URL = "https://connect.tradedoubler.com/advertiser";
const LOCALE = "en-GB";
const SUPPORTED_CURRENCIES = new Set(["GBP", "EUR", "USD", "AUD", "SEK", "NOK", "DKK", "ISK", "PLN"]);

const SLIDE_TABLE_BINDINGS = {
  program_exec_summary: ["programYoYTable"],
  kpi_volume_conversion: ["programYoYTable"],
  kpi_cost_roi: ["programYoYTable"],
  publisher_overview: ["topPublisherPerformance", "top10ByOV"],
  movers_sales: ["moversShakersSales"],
  movers_ov: ["moversShakersOV"],
  movers_clicks: ["moversShakersClicks"],
  movers_aov: ["moversShakersAOV"],
  segment_performance: ["segmentSummary"],
  brand_new_publishers: ["brandNewTop"],
  publisher_expansion_opportunities: ["publisherCategoryRecommendationSlides"],
  new_emerging_publishers: ["newEmergingTop"],
  recommendations: ["newPublisherProspects"]
};

function safeNum(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value).trim().replace(/[^\d,.-]/g, "").replace(/\s+/g, "");
  if (!text) return 0;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "");
      const index = text.lastIndexOf(",");
      text = `${text.slice(0, index).replace(/,/g, "")}.${text.slice(index + 1)}`;
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const decDigits = text.length - lastComma - 1;
    text = decDigits >= 1 && decDigits <= 2
      ? `${text.slice(0, lastComma).replace(/,/g, "")}.${text.slice(lastComma + 1)}`
      : text.replace(/,/g, "");
  } else if (lastDot > -1) {
    const decDigits = text.length - lastDot - 1;
    if (!(decDigits >= 1 && decDigits <= 2)) text = text.replace(/\./g, "");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function pickMax(...values) {
  return values.reduce((max, value) => Math.max(max, safeNum(value)), 0);
}

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeCurrencyCode(code) {
  const value = asText(code).toUpperCase();
  return SUPPORTED_CURRENCIES.has(value) ? value : "EUR";
}

function currencySymbol(code) {
  switch (String(code || "").toUpperCase()) {
    case "GBP": return "\u00a3";
    case "EUR": return "\u20ac";
    case "USD": return "$";
    case "AUD": return "A$";
    case "PLN": return "z\u0142";
    case "SEK":
    case "NOK":
    case "DKK":
    case "ISK": return "kr";
    default: return "";
  }
}

function fmtInt(value) {
  return Math.round(safeNum(value)).toLocaleString(LOCALE);
}

function fmtMoney0(value, symbol) {
  const number = Math.round(safeNum(value));
  const sign = number < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(number).toLocaleString(LOCALE)}`;
}

function fmtMoney2(value, symbol) {
  const number = safeNum(value);
  const sign = number < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(number).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct2(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${Number(value).toFixed(2)}%`;
}

function fmtVar1(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function pct(a, b) {
  return b ? (a / b) * 100 : null;
}

function varPct(a, b) {
  return b ? ((a - b) / b) * 100 : null;
}

function normalizeIdList(input) {
  if (Array.isArray(input)) return input.map((value) => asText(value)).filter(Boolean);
  if (typeof input === "string" && input.trim()) {
    return input.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

function toYyyyMmDd(input, fallbackDate) {
  const value = asText(input);
  if (/^\d{8}$/.test(value)) return value;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 8) return digits;
  const date = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftYear(yyyymmdd, years) {
  const year = Number(String(yyyymmdd).slice(0, 4)) + years;
  return `${year}${String(yyyymmdd).slice(4, 8)}`;
}

function formatYmd(yyyymmdd) {
  const value = String(yyyymmdd || "");
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

function normalizeIncomingRequest(input = {}) {
  const raw = input.incomingText || input.message || input.body?.message || "";
  const prefix = "QBR_REQUEST";
  let payload = {};
  if (input.payload && typeof input.payload === "object") payload = input.payload;
  else if (input.qbr_payload && typeof input.qbr_payload === "object") payload = input.qbr_payload;
  else if (input.body?.payload && typeof input.body.payload === "object") payload = input.body.payload;
  else if (input.body?.qbr_payload && typeof input.body.qbr_payload === "object") payload = input.body.qbr_payload;
  else if (typeof raw === "string" && raw.startsWith(prefix)) {
    try {
      payload = JSON.parse(raw.slice(prefix.length).trim());
    } catch {
      payload = {};
    }
  }

  const tdTokens = input.body?.td_tokens
    || input.td_tokens
    || input.qbr_payload?.td_tokens
    || input.body?.qbr_payload?.td_tokens
    || payload.td_tokens
    || {};

  return { payload, tdTokens, threadId: input.thread_id || input.threadId || "" };
}

function normalizeQbrPayload(rawPayload = {}, options = {}) {
  const now = typeof options.now === "function" ? new Date(options.now()) : new Date();
  const fromSource = rawPayload.fromDate || rawPayload.startDate || rawPayload.from || "";
  const toSource = rawPayload.toDate || rawPayload.endDate || rawPayload.to || "";
  const fallbackTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fallbackFrom = new Date(fallbackTo);
  fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - 89);

  const fromDate = toYyyyMmDd(fromSource, fallbackFrom);
  const toDate = toYyyyMmDd(toSource, fallbackTo);
  const prevFromDate = shiftYear(fromDate, -1);
  const prevToDate = shiftYear(toDate, -1);
  const languageCode = asText(rawPayload.languageCode || "EN").toUpperCase();
  const languageName = {
    EN: "English",
    DE: "German",
    FR: "French",
    ES: "Spanish",
    IT: "Italian",
    NL: "Dutch",
    PL: "Polish",
    SV: "Swedish",
    NO: "Norwegian",
    DA: "Danish",
    FI: "Finnish"
  }[languageCode] || "English";

  const analysisSource = asText(rawPayload.analysisLevel || rawPayload.analysisScope || rawPayload.scope || "program").toLowerCase();
  const analysisLevel = ["organization", "org"].includes(analysisSource) ? "organization" : "program";
  const organizationId = asText(rawPayload.organizationId);
  const programId = asText(rawPayload.programId);
  const publisherProgramId = asText(rawPayload.publisherProgramId || programId);
  const publisherProgramIds = Array.from(new Set([
    ...normalizeIdList(rawPayload.publisherProgramIds),
    ...normalizeIdList(rawPayload.advertiserProgramIds),
    ...normalizeIdList(rawPayload.programIds),
    ...normalizeIdList(rawPayload.analysisProgramIds),
    publisherProgramId,
    programId
  ].filter(Boolean)));
  const analysisProgramIds = Array.from(new Set([
    ...publisherProgramIds,
    ...normalizeIdList(rawPayload.analysisProgramIds),
    ...normalizeIdList(rawPayload.advertiserProgramIds),
    ...normalizeIdList(rawPayload.programIds),
    programId
  ].filter(Boolean)));
  const kpiScopeMode = analysisProgramIds.length > 1
    ? "organization_fallback"
    : (analysisProgramIds.length === 1 ? "single_program" : (organizationId ? "organization" : "none"));
  const statsScopeQuery = kpiScopeMode === "single_program"
    ? `&programId=${encodeURIComponent(analysisProgramIds[0])}`
    : (organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : "");
  const programName = asText(rawPayload.programName || rawPayload.clientName);
  const analysisLabel = analysisLevel === "organization"
    ? (programName || `Organisation ${organizationId || "Unknown"}`)
    : (programName || `Program ${programId || "Unknown"}`);

  return {
    payload: {
      ...rawPayload,
      analysisLevel,
      organizationId,
      programId,
      programName: analysisLabel,
      publisherProgramId,
      publisherProgramName: asText(rawPayload.publisherProgramName),
      publisherProgramMode: asText(rawPayload.publisherProgramMode || "selected").toLowerCase() === "all" ? "all_organization" : "selected",
      publisherProgramIds,
      publisherProgramCount: publisherProgramIds.length,
      analysisProgramIds,
      kpiScopeMode,
      fromDate,
      toDate,
      currencyCode: normalizeCurrencyCode(rawPayload.currencyCode),
      languageCode,
      qbrFocus: asText(rawPayload.qbrFocus || rawPayload.focusTheme || "General performance review"),
      qbrFocusDetail: asText(rawPayload.qbrFocusDetail || rawPayload.focusDetail),
      languageName,
      reportingPeriod: `${formatYmd(fromDate)} to ${formatYmd(toDate)}`,
      comparisonPeriod: `${formatYmd(prevFromDate)} to ${formatYmd(prevToDate)}`,
      statsScopeQuery
    },
    prev: { fromDate: prevFromDate, toDate: prevToDate }
  };
}

function rowsFromResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.rows)) return response.rows;
  if (Array.isArray(response?.results)) return response.results;
  return [];
}

async function readFetchJson(response, label) {
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail = data && typeof data === "object" ? data.error || data.message || data.detail : data;
    throw new Error(`${label} failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }
  return data;
}

async function fetchJsonWithRetry(fetchImpl, url, init, label, options = {}) {
  const retries = Math.max(0, Number(options.retries ?? 2));
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 45000));
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return await readFetchJson(response, label);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) break;
    }
  }
  throw lastError;
}

async function fetchOptionalJson(fetchImpl, url, init, label, options = {}) {
  try {
    return await fetchJsonWithRetry(fetchImpl, url, init, label, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/\bHTTP\s+40[13]\b|invalid[_ -]?token|unauthori[sz]ed|forbidden/i.test(message)) {
      throw error;
    }
    return {
      items: [],
      optionalError: message
    };
  }
}

function tdHeaders(tdTokens) {
  const token = tdTokens.impersonate_access_token || tdTokens.access_token || tdTokens.user_access_token;
  return {
    "Accept": "application/json",
    "Authorization": `Bearer ${token || ""}`
  };
}

function buildUrl(pathname, params) {
  const url = new URL(`${TD_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchPaginatedStatistics(context, period) {
  const allItems = [];
  let offset = 0;
  const limit = 100;
  let total = Infinity;
  while (offset < total) {
    const dateParams = period === "previous"
      ? { fromDate: context.prev.fromDate, toDate: context.prev.toDate }
      : { fromDate: context.payload.fromDate, toDate: context.payload.toDate };
    const base = buildUrl("/report/statistics", {
      limit,
      offset,
      ...dateParams,
      reportCurrencyCode: context.payload.currencyCode,
      intervalType: "period",
      reportType: "program"
    });
    const url = `${base}${context.payload.statsScopeQuery || ""}`;
    const data = await fetchJsonWithRetry(context.fetchImpl, url, {
      method: "GET",
      headers: tdHeaders(context.tdTokens)
    }, `TD ${period} program statistics`);
    const rows = rowsFromResponse(data);
    allItems.push(...rows);
    total = Number.isFinite(Number(data?.total)) ? Number(data.total) : allItems.length;
    offset += limit;
    if (!rows.length || offset >= total) break;
  }
  return allItems;
}

async function fetchPublisherRows(context, period, programIds) {
  const all = [];
  for (const programId of programIds) {
    const dateParams = period === "previous"
      ? { fromDate: context.prev.fromDate, toDate: context.prev.toDate }
      : { fromDate: context.payload.fromDate, toDate: context.payload.toDate };
    const url = buildUrl("/report/statistics/events/sources/export", {
      reportCurrencyCode: context.payload.currencyCode,
      ...dateParams,
      programId,
      lastModified: "true",
      intervalType: "period"
    });
    const data = await fetchJsonWithRetry(context.fetchImpl, url, {
      method: "GET",
      headers: tdHeaders(context.tdTokens)
    }, `TD ${period} publisher export`);
    all.push(...rowsFromResponse(data).map((row) => ({ ...row, programId: row.programId || programId })));
  }
  return all;
}

async function fetchCategoryRows(context, period, programIds) {
  const all = [];
  for (const programId of programIds) {
    const dateParams = period === "previous"
      ? { fromDate: context.prev.fromDate, toDate: context.prev.toDate }
      : { fromDate: context.payload.fromDate, toDate: context.payload.toDate };
    const url = buildUrl("/report/statistics/categories", {
      limit: 100,
      offset: 0,
      programId,
      reportCurrencyCode: context.payload.currencyCode,
      intervalType: "period",
      reportType: "program",
      publisherCategoryType: "tradedoubler",
      ...dateParams
    });
    const data = await fetchOptionalJson(context.fetchImpl, url, {
      method: "GET",
      headers: tdHeaders(context.tdTokens)
    }, `TD ${period} publisher categories`);
    all.push(...rowsFromResponse(data).map((row) => ({ ...row, programId: row.programId || programId })));
  }
  return all;
}

function sourcePromotionTypeName(row) {
  return asText(row.promotionTypeName || row.publisherType || row.category || "Unclassified", "Unclassified");
}

function sourcePromotionTypeId(row) {
  return asText(row.promotionTypeId || row.publisherTypeId || row.promotionType?.id || row.publisherType?.id);
}

function sourceTypeKey(row) {
  const typeId = sourcePromotionTypeId(row);
  return typeId ? `id:${typeId}` : `name:${sourcePromotionTypeName(row).toLowerCase()}`;
}

function sourceTypeMatches(row, sourceType) {
  const typeId = sourcePromotionTypeId(row);
  if (sourceType.typeId && typeId) return typeId === sourceType.typeId;
  return sourcePromotionTypeName(row).toLowerCase() === sourceType.typeName.toLowerCase();
}

function responseTotal(data) {
  const total = Number(data?.total ?? data?.totalCount ?? data?.count);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

async function fetchPublisherSourceTypeCounts(context, sourceRows) {
  const sourceTypes = new Map();
  for (const row of sourceRows) {
    const programId = asText(row.programId || row.publisherProgramId || row["Program ID"]);
    const typeName = sourcePromotionTypeName(row);
    if (!programId || !typeName) continue;
    const typeId = sourcePromotionTypeId(row);
    const key = `${programId}|${typeId ? `id:${typeId}` : `name:${typeName.toLowerCase()}`}`;
    if (!sourceTypes.has(key)) sourceTypes.set(key, { programId, typeId, typeName });
  }

  const counts = new Map();
  for (const [key, sourceType] of sourceTypes.entries()) {
    const base = asText(context.payload.publisherMetadataEndpoint || `${TD_BASE_URL}/sources`).replace(/\?+$/, "");
    const url = new URL(base);
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", "0");
    url.searchParams.set("programId", sourceType.programId);
    if (sourceType.typeId) {
      url.searchParams.set("promotionTypeId", sourceType.typeId);
    } else {
      url.searchParams.set("promotionTypeName", sourceType.typeName);
    }

    const data = await fetchOptionalJson(context.fetchImpl, url.toString(), {
      method: "GET",
      headers: tdHeaders(context.tdTokens)
    }, "TD publisher source metadata count");
    const total = responseTotal(data);
    const sampleRows = rowsFromResponse(data);
    const filterLooksSupported = !sampleRows.length || sampleRows.every((row) => sourceTypeMatches(row, sourceType));
    if (total !== null && filterLooksSupported) counts.set(key, total);
  }
  return counts;
}

async function fetchPublisherSourceMetadata(context, programIds) {
  const limit = Math.max(1, Math.min(100, Number(context.payload.publisherSourceLimit || 100)));
  const maxPages = Math.max(1, Math.min(25, Number(context.payload.publisherSourceMaxPages || 10)));
  const all = [];
  for (const programId of programIds) {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const base = asText(context.payload.publisherMetadataEndpoint || `${TD_BASE_URL}/sources`).replace(/\?+$/, "");
      const url = new URL(base);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(pageIndex * limit));
      url.searchParams.set("programId", programId);
      const data = await fetchOptionalJson(context.fetchImpl, url.toString(), {
        method: "GET",
        headers: tdHeaders(context.tdTokens)
      }, "TD publisher source metadata");
      const rows = rowsFromResponse(data);
      all.push(...rows.map((row) => ({ ...row, programId: row.programId || programId })));
      const total = Number(data?.total || 0);
      if (!rows.length || (total && (pageIndex + 1) * limit >= total)) break;
    }
  }

  const deduped = dedupeSources(all);
  const typeCounts = await fetchPublisherSourceTypeCounts(context, deduped);
  return deduped.map((row) => {
    const programId = asText(row.programId || row.publisherProgramId || row["Program ID"]);
    const key = `${programId}|${sourceTypeKey(row)}`;
    const count = typeCounts.get(key);
    return Number.isFinite(count) ? { ...row, publisherTypeAvailableCount: count } : row;
  });
}
function pickProgramIdentity(item) {
  const id = asText(item.programId ?? item.id ?? item.program?.id ?? item.programID);
  const name = asText(item.programName || item.name || item.program?.name || item.programDisplayName || item.programTitle, id ? `Program ${id}` : "Unknown program");
  const market = asText(item.market || item.marketName || item.country || item.countryCode || item.region, "-");
  return { key: id || name.toLowerCase(), id: id || "-", name, market };
}

function canonicalProgramKey(value) {
  const raw = asText(value);
  if (!raw || raw === "-") return "";
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw.toLowerCase();
}

function programMarketFromMetadata(item) {
  return asText(item?.market || item?.marketName || item?.country || item?.countryCode || item?.region);
}

function addProgramMarket(map, id, market) {
  const key = canonicalProgramKey(id);
  const value = asText(market);
  if (key && value && value !== "-") map.set(key, value);
}

function programMetadataMarketMap(payload = {}) {
  const map = new Map();
  for (const source of [payload.advertiserPrograms, payload.selectedPrograms, payload.programs, payload.programMetadata]) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const id = item?.programId ?? item?.id ?? item?.program?.id ?? item?.programID;
        addProgramMarket(map, id, programMarketFromMetadata(item));
      }
    } else if (source && typeof source === "object") {
      for (const [id, item] of Object.entries(source)) {
        const market = typeof item === "string" ? item : programMarketFromMetadata(item);
        addProgramMarket(map, id, market);
      }
    }
  }
  return map;
}

function resolveProgramScopeMarket(rowMarket, programId, metadataMarkets) {
  const explicit = asText(rowMarket);
  if (explicit && explicit !== "-") return explicit;
  return metadataMarkets.get(canonicalProgramKey(programId)) || "-";
}

function aggregateProgramRows(items) {
  return (items || []).reduce((acc, item) => {
    const commission = item.commission || item.salesCommission || {};
    acc.clicks += safeNum(item.clicks);
    acc.impressions += safeNum(item.impressions);
    acc.sales += safeNum(item.sales);
    acc.orderValue += safeNum(item.orderValue ?? item.salesOrderValue);
    acc.pubCommission += safeNum(commission.publisherCommission);
    acc.totalCommission += safeNum(commission.totalCommission);
    return acc;
  }, { clicks: 0, impressions: 0, sales: 0, orderValue: 0, pubCommission: 0, totalCommission: 0 });
}

function calcProgram(agg) {
  return {
    ...agg,
    convRate: agg.clicks ? pct(agg.sales, agg.clicks) : 0,
    aov: agg.sales ? agg.orderValue / agg.sales : 0,
    cpa: agg.sales ? agg.totalCommission / agg.sales : 0,
    roi: agg.totalCommission ? agg.orderValue / agg.totalCommission : 0
  };
}

function filterByProgramSelection(items, payload) {
  const ids = new Set([payload.programId, payload.publisherProgramId, ...normalizeIdList(payload.programIds), ...payload.publisherProgramIds].filter(Boolean).map(String));
  const names = new Set([payload.programName, payload.clientName, payload.publisherProgramName].filter(Boolean).map((value) => String(value).toLowerCase()));
  if (payload.analysisLevel !== "program" || (!ids.size && !names.size)) return { rows: items, matched: false };
  const filtered = items.filter((item) => {
    const rowProgramId = asText(item.programId ?? item.id ?? item.program?.id);
    const rowProgramName = asText(item.programName ?? item.name ?? item.program?.name ?? item.programDisplayName).toLowerCase();
    return (rowProgramId && ids.has(rowProgramId)) || (rowProgramName && names.has(rowProgramName));
  });
  return filtered.length ? { rows: filtered, matched: true } : { rows: items, matched: false };
}

function processProgramData(currentRaw, previousRaw, payload) {
  const currentFiltered = filterByProgramSelection(currentRaw, payload);
  const previousFiltered = filterByProgramSelection(previousRaw, payload);
  const currentRows = currentFiltered.rows;
  const previousRows = previousFiltered.rows;
  const symbol = currencySymbol(payload.currencyCode);
  const metadataMarkets = programMetadataMarketMap(payload);
  const cur = calcProgram(aggregateProgramRows(currentRows));
  const prev = calcProgram(aggregateProgramRows(previousRows));
  const diff = (a, b) => a - b;
  const programYoYTable = [
    { Row: "Recent", Clicks: fmtInt(cur.clicks), Sales: fmtInt(cur.sales), "Conv Rate": fmtPct2(cur.convRate), "Order value": fmtMoney0(cur.orderValue, symbol), AOV: fmtMoney2(cur.aov, symbol), "Publ Commission": fmtMoney0(cur.pubCommission, symbol), "Total Commission": fmtMoney0(cur.totalCommission, symbol), CPA: fmtMoney2(cur.cpa, symbol), ROI: cur.roi ? cur.roi.toFixed(2) : "" },
    { Row: "Previous", Clicks: fmtInt(prev.clicks), Sales: fmtInt(prev.sales), "Conv Rate": fmtPct2(prev.convRate), "Order value": fmtMoney0(prev.orderValue, symbol), AOV: fmtMoney2(prev.aov, symbol), "Publ Commission": fmtMoney0(prev.pubCommission, symbol), "Total Commission": fmtMoney0(prev.totalCommission, symbol), CPA: fmtMoney2(prev.cpa, symbol), ROI: prev.roi ? prev.roi.toFixed(2) : "" },
    { Row: "Difference", Clicks: fmtInt(diff(cur.clicks, prev.clicks)), Sales: fmtInt(diff(cur.sales, prev.sales)), "Conv Rate": fmtPct2(diff(cur.convRate, prev.convRate)), "Order value": fmtMoney0(diff(cur.orderValue, prev.orderValue), symbol), AOV: fmtMoney2(diff(cur.aov, prev.aov), symbol), "Publ Commission": fmtMoney0(diff(cur.pubCommission, prev.pubCommission), symbol), "Total Commission": fmtMoney0(diff(cur.totalCommission, prev.totalCommission), symbol), CPA: fmtMoney2(diff(cur.cpa, prev.cpa), symbol), ROI: diff(cur.roi, prev.roi).toFixed(2) },
    { Row: "% Variance", Clicks: fmtVar1(varPct(cur.clicks, prev.clicks)), Sales: fmtVar1(varPct(cur.sales, prev.sales)), "Conv Rate": fmtVar1(varPct(cur.convRate, prev.convRate)), "Order value": fmtVar1(varPct(cur.orderValue, prev.orderValue)), AOV: fmtVar1(varPct(cur.aov, prev.aov)), "Publ Commission": fmtVar1(varPct(cur.pubCommission, prev.pubCommission)), "Total Commission": fmtVar1(varPct(cur.totalCommission, prev.totalCommission)), CPA: fmtVar1(varPct(cur.cpa, prev.cpa)), ROI: fmtVar1(varPct(cur.roi, prev.roi)) }
  ];

  const previousByKey = new Map(groupPrograms(previousRows).map((row) => [row.key, row]));
  const programScopeTable = groupPrograms(currentRows)
    .map((current) => {
      const previous = previousByKey.get(current.key) || {};
      const currentConvRate = current.clicks ? pct(current.sales, current.clicks) : 0;
      const currentAov = current.sales ? current.orderValue / current.sales : 0;
      return {
        "Program ID": current.programId,
        Market: resolveProgramScopeMarket(current.market, current.programId, metadataMarkets),
        Clicks: fmtInt(current.clicks),
        Impressions: fmtInt(current.impressions),
        Sales: fmtInt(current.sales),
        "Conversion Rate": fmtPct2(currentConvRate),
        AOV: fmtMoney2(currentAov, symbol),
        "Total Order Value": fmtMoney0(current.orderValue, symbol),
        "YoY Change": fmtVar1(varPct(current.orderValue, previous.orderValue || 0)),
        _sortCurrentOV: current.orderValue
      };
    })
    .sort((a, b) => b._sortCurrentOV - a._sortCurrentOV)
    .slice(0, payload.analysisLevel === "organization" ? 6 : 25)
    .map(({ _sortCurrentOV, ...row }) => row);

  return {
    programYoYTable,
    programScopeTable,
    dataForAI: [
      `Reporting period: ${payload.reportingPeriod}`,
      `YoY comparison period: ${payload.comparisonPeriod}`,
      `Analysis level: ${payload.analysisLevel}`,
      `Current filter matched: ${currentFiltered.matched}`,
      `Previous filter matched: ${previousFiltered.matched}`,
      "Program YoY Summary Table (Recent vs Previous)",
      JSON.stringify(programYoYTable, null, 2)
    ].join("\n"),
    diagnostics: {
      currentRawRows: currentRaw.length,
      previousRawRows: previousRaw.length,
      currentFilteredRows: currentRows.length,
      previousFilteredRows: previousRows.length
    }
  };
}

function groupPrograms(items) {
  const map = new Map();
  for (const item of items || []) {
    const identity = pickProgramIdentity(item);
    if (!map.has(identity.key)) {
      map.set(identity.key, { key: identity.key, programId: identity.id, programName: identity.name, market: identity.market, clicks: 0, impressions: 0, sales: 0, orderValue: 0, totalCommission: 0 });
    }
    const acc = map.get(identity.key);
    const commission = item.commission || item.salesCommission || {};
    acc.clicks += safeNum(item.clicks);
    acc.impressions += safeNum(item.impressions);
    acc.sales += safeNum(item.sales);
    acc.orderValue += safeNum(item.orderValue ?? item.salesOrderValue);
    acc.totalCommission += safeNum(commission.totalCommission);
  }
  return Array.from(map.values());
}

function publisherName(row) {
  return asText(row.publisher || row.Publisher || row.sourceName || row.name || row.publisher?.name || row.source?.name, "Unknown Publisher");
}

function publisherKey(row) {
  return asText(row.sourceId || row.publisherId || row.siteId || row.id || publisherName(row)).toLowerCase();
}

function inferSegment(row) {
  const explicit = asText(row.segment || row.publisherType || row.publisherCategoryName || row.promotionTypeName || row.category);
  if (explicit) return explicit;
  const name = publisherName(row).toLowerCase();
  if (/(css|google shopping|comparison|compare|idealo|shoparize|genie shopping)/.test(name)) return "CSS";
  if (/(which|techradar|trustedreviews|guardian|telegraph|independent|media|content)/.test(name)) return "Content";
  if (/(voucher|coupon|deal|discount|hotukdeals|vouchercodes)/.test(name)) return "Voucher";
  if (/(cashback|quidco|topcashback|blue light|trumf|shoop|igraal|payback|shopback|refunder|widilo|rabatta)/.test(name)) return "Cashback";
  return "Other";
}

function aggregatePublishers(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = publisherKey(row);
    if (!map.has(key)) {
      map.set(key, { key, publisher: publisherName(row), siteId: asText(row.siteId || row.sourceId || row.id), segment: inferSegment(row), clicks: 0, sales: 0, ov: 0, pubCommission: 0 });
    }
    const acc = map.get(key);
    const commission = row.commission || row.salesCommission || {};
    acc.clicks += safeNum(row.clicks);
    acc.sales += safeNum(row.sales) + safeNum(row.iSales);
    acc.ov += pickMax(row.salesOrderValue, row.iSalesOrderValue, row.orderValue, row.eventOrderValue, row.ov);
    acc.pubCommission += pickMax(commission.publisherCommission, row.salesCommission?.publisherCommission, row.publisherCommission);
  }
  return Array.from(map.values());
}

function readProgramIdFromRow(row) {
  return asText(row.programId || row.programID || row.program?.id || row.advertiserProgramId || row.publisherProgramId);
}

function readProgramNameFromRow(row) {
  return asText(row.programName || row.program?.name || row.programDisplayName || row.name);
}

function aggregatePublisherPrograms(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const programId = readProgramIdFromRow(row);
    if (!programId) continue;
    const publisher = publisherName(row);
    const key = `${programId}|${publisherKey(row)}`;
    if (!map.has(key)) {
      map.set(key, {
        programPublisherKey: key,
        programId,
        programName: readProgramNameFromRow(row) || programId,
        publisher,
        siteId: asText(row.siteId || row.sourceId || row.publisherId || row.id),
        segment: inferSegment(row),
        clicks: 0,
        sales: 0,
        ov: 0,
        pubCommission: 0
      });
    }
    const acc = map.get(key);
    const commission = row.commission || row.salesCommission || {};
    if (!acc.siteId) acc.siteId = asText(row.siteId || row.sourceId || row.publisherId || row.id);
    acc.clicks += safeNum(row.clicks);
    acc.sales += safeNum(row.sales) + safeNum(row.iSales);
    acc.ov += pickMax(row.salesOrderValue, row.iSalesOrderValue, row.orderValue, row.eventOrderValue, row.ov);
    acc.pubCommission += pickMax(commission.publisherCommission, row.salesCommission?.publisherCommission, row.publisherCommission);
  }
  return Array.from(map.values());
}

function rowForPublisher(row, previous, symbol) {
  const prevOV = previous?.ov || 0;
  const prevSales = previous?.sales || 0;
  const prevClicks = previous?.clicks || 0;
  const aov = row.sales ? row.ov / row.sales : 0;
  const prevAov = prevSales ? prevOV / prevSales : 0;
  const cpa = row.sales >= 3 ? row.pubCommission / row.sales : null;
  return {
    Publisher: row.publisher,
    "Site ID": row.siteId || "-",
    Segment: row.segment,
    Clicks: fmtInt(row.clicks),
    Sales: fmtInt(row.sales),
    "Conversion Rate": row.clicks ? fmtPct2(pct(row.sales, row.clicks)) : "N/A",
    "Total Order Value": fmtMoney0(row.ov, symbol),
    "YoY Change": fmtVar1(varPct(row.ov, prevOV)),
    "Current Sales": fmtInt(row.sales),
    "Sales YoY Change": fmtInt(row.sales - prevSales),
    "Sales YoY %": fmtVar1(varPct(row.sales, prevSales)),
    "Current OV": fmtMoney0(row.ov, symbol),
    "OV YoY Change": fmtMoney0(row.ov - prevOV, symbol),
    "OV YoY %": fmtVar1(varPct(row.ov, prevOV)),
    "Current Clicks": fmtInt(row.clicks),
    "Clicks YoY Change": fmtInt(row.clicks - prevClicks),
    "Clicks YoY %": fmtVar1(varPct(row.clicks, prevClicks)),
    AOV: row.sales ? fmtMoney2(aov, symbol) : "N/A",
    "AOV YoY Change": fmtMoney2(aov - prevAov, symbol),
    "AOV YoY %": fmtVar1(varPct(aov, prevAov)),
    "Publisher Commission": fmtMoney0(row.pubCommission, symbol),
    CPA: cpa !== null ? fmtMoney2(cpa, symbol) : "N/A",
    _ov: row.ov,
    _sales: row.sales,
    _clicks: row.clicks,
    _aov: aov,
    _prevOV: prevOV,
    _prevSales: prevSales,
    _prevClicks: prevClicks,
    _prevAov: prevAov
  };
}

function cleanSortFields(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("_")));
}

function buildMoverShakerRows(rows, options) {
  const {
    currentField,
    previousField,
    currentLabel,
    changeLabel,
    pctLabel,
    formatter
  } = options;
  const eligible = rows.filter((row) => safeNum(row[previousField]) > 0);
  const toOutput = (row, direction) => {
    const current = safeNum(row[currentField]);
    const previous = safeNum(row[previousField]);
    const change = current - previous;
    const yoy = varPct(current, previous);
    return {
      Publisher: row.Publisher,
      "Site ID": row["Site ID"] || "-",
      Segment: row.Segment,
      Direction: direction,
      [currentLabel]: formatter(current),
      "YoY Change": formatter(change),
      "YoY %": fmtVar1(yoy),
      [changeLabel]: formatter(change),
      [pctLabel]: fmtVar1(yoy),
      _change: change
    };
  };
  const up = eligible
    .filter((row) => safeNum(row[currentField]) - safeNum(row[previousField]) > 0)
    .sort((a, b) => (safeNum(b[currentField]) - safeNum(b[previousField])) - (safeNum(a[currentField]) - safeNum(a[previousField])))
    .slice(0, 10)
    .map((row) => toOutput(row, "Up"));
  const down = eligible
    .filter((row) => safeNum(row[currentField]) - safeNum(row[previousField]) < 0)
    .sort((a, b) => (safeNum(a[currentField]) - safeNum(a[previousField])) - (safeNum(b[currentField]) - safeNum(b[previousField])))
    .slice(0, 10)
    .map((row) => toOutput(row, "Down"));
  return [...up, ...down].map(cleanSortFields);
}

function buildOrderValueMovementRanking(moverRows) {
  const normalize = (rows, direction) => rows
    .filter((row) => row.Direction === direction)
    .map((row) => ({
      publisher: row.Publisher,
      siteId: row["Site ID"] || "",
      segment: row.Segment || "",
      value: safeNum(row["OV YoY Change"] || row["YoY Change"]),
      label: `${row["Current OV"] || "-"}${row["OV YoY %"] ? ` (${row["OV YoY %"]})` : ""}`
    }));
  return {
    top: normalize(moverRows, "Up"),
    bottom: normalize(moverRows, "Down"),
    sourceCount: moverRows.length
  };
}

function processPublisherPack(currentRows, previousRows, categoryCurrentRows, categoryPreviousRows, sourceRows, payload) {
  const symbol = currencySymbol(payload.currencyCode);
  const current = aggregatePublishers(currentRows);
  const previous = aggregatePublishers(previousRows);
  const previousByKey = new Map(previous.map((row) => [row.key, row]));
  const previousByName = new Map();
  for (const row of previous) {
    const key = row.publisher.toLowerCase();
    if (!previousByName.has(key)) previousByName.set(key, { ov: 0, sales: 0, pubCommission: 0, clicks: 0 });
    const acc = previousByName.get(key);
    acc.ov += row.ov;
    acc.sales += row.sales;
    acc.pubCommission += row.pubCommission;
    acc.clicks += row.clicks;
  }
  const mapped = current.map((row) => rowForPublisher(row, previousByKey.get(row.key) || previousByName.get(row.publisher.toLowerCase()), symbol));
  const byOV = mapped.slice().sort((a, b) => b._ov - a._ov);

  const categorySegmentSummary = buildCategorySegmentSummary(categoryCurrentRows, categoryPreviousRows, symbol);
  const segmentSummary = categorySegmentSummary.length ? categorySegmentSummary : buildSegmentSummary(mapped, symbol);
  const brandNewRows = mapped.filter((row) => row._prevOV === 0 && row._ov > 0).sort((a, b) => b._ov - a._ov);
  const brandNewTop = brandNewRows.slice(0, 10).map(cleanSortFields);
  const newEmergingTop = mapped.filter((row) => row._prevOV > 0 && row._prevOV < 2000 && row._ov > row._prevOV).sort((a, b) => b._ov - a._ov).slice(0, 10).map(cleanSortFields);
  const previousKeys = new Set(current.map((row) => row.key));
  const stoppedActivityTop = previous.filter((row) => !previousKeys.has(row.key)).slice(0, 10).map((row) => ({
    Publisher: row.publisher,
    Segment: row.segment,
    "Previous Sales": fmtInt(row.sales),
    "Previous OV": fmtMoney0(row.ov, symbol),
    "Previous Clicks": fmtInt(row.clicks)
  }));

  const publisherCategorySlides = buildPublisherCategorySlides(sourceRows);
  const previousProgramByKey = new Map(aggregatePublisherPrograms(previousRows).map((row) => [row.programPublisherKey, row]));
  const publisherPerformanceByProgram = aggregatePublisherPrograms(currentRows)
    .filter((row) => row.programId && (row.ov > 0 || row.sales > 0 || row.clicks > 0))
    .map((row) => {
      const prev = previousProgramByKey.get(row.programPublisherKey) || { ov: 0, sales: 0 };
      const aov = row.sales ? row.ov / row.sales : 0;
      const cpa = row.sales >= 3 ? row.pubCommission / row.sales : null;
      return {
        "Program ID": row.programId,
        "Program Name": row.programName || row.programId,
        Publisher: row.publisher,
        "Site ID": row.siteId || "-",
        Segment: row.segment,
        Clicks: fmtInt(row.clicks),
        Sales: fmtInt(row.sales),
        "Conversion Rate": row.clicks ? fmtPct2(pct(row.sales, row.clicks)) : "N/A",
        AOV: row.sales ? fmtMoney2(aov, symbol) : "N/A",
        "Total Order Value": fmtMoney0(row.ov, symbol),
        "OV YoY %": fmtVar1(varPct(row.ov, prev.ov)),
        "Sales YoY %": fmtVar1(varPct(row.sales, prev.sales)),
        "Publisher Commission": fmtMoney0(row.pubCommission, symbol),
        CPA: cpa !== null ? fmtMoney2(cpa, symbol) : "N/A",
        _sortOV: row.ov
      };
    })
    .sort((a, b) => b._sortOV - a._sortOV)
    .map(({ _sortOV, ...row }) => row);
  const top10ByOV = byOV.slice(0, 10).map(cleanSortFields);
  const moversShakersOV = buildMoverShakerRows(mapped, {
    currentField: "_ov",
    previousField: "_prevOV",
    currentLabel: "Current OV",
    changeLabel: "OV YoY Change",
    pctLabel: "OV YoY %",
    formatter: (value) => fmtMoney0(value, symbol)
  });
  const moversShakersSales = buildMoverShakerRows(mapped, {
    currentField: "_sales",
    previousField: "_prevSales",
    currentLabel: "Current Sales",
    changeLabel: "Sales YoY Change",
    pctLabel: "Sales YoY %",
    formatter: fmtInt
  });
  const moversShakersClicks = buildMoverShakerRows(mapped, {
    currentField: "_clicks",
    previousField: "_prevClicks",
    currentLabel: "Current Clicks",
    changeLabel: "Clicks YoY Change",
    pctLabel: "Clicks YoY %",
    formatter: fmtInt
  });
  const moversShakersAOV = buildMoverShakerRows(mapped, {
    currentField: "_aov",
    previousField: "_prevAov",
    currentLabel: "Current AOV",
    changeLabel: "AOV YoY Change",
    pctLabel: "AOV YoY %",
    formatter: (value) => fmtMoney2(value, symbol)
  });
  const publisherOrderValueRanking = buildOrderValueMovementRanking(moversShakersOV);
  const brandNewPublisherRanking = {
    top: brandNewRows.slice(0, 10).map((row) => ({
      publisher: row.Publisher,
      siteId: row["Site ID"] || "",
      segment: row.Segment,
      value: row._ov,
      label: row["Current OV"]
    })),
    bottom: [],
    sourceCount: brandNewRows.length
  };

  const publisherTables = {
    segmentSummary,
    top10Increase: moversShakersOV.filter((row) => row.Direction === "Up"),
    top10Decrease: moversShakersOV.filter((row) => row.Direction === "Down"),
    top10ByOV,
    topPublisherPerformance: top10ByOV,
    publisherPerformanceByProgram,
    newEmergingTop,
    brandNewTop,
    stoppedActivityTop,
    moversShakersSales,
    moversShakersOV,
    moversShakersClicks,
    moversShakersAOV,
    newPublisherProspects: publisherCategorySlides.flatMap((slide) => slide.recommendedPublishers).slice(0, 10),
    publisherOrderValueRanking,
    brandNewPublisherRanking
  };
  if (publisherCategorySlides.length) publisherTables.publisherCategoryRecommendationSlides = publisherCategorySlides;

  return {
    publisherTables,
    publisherCategorySlides,
    publisherOrderValueRanking,
    brandNewPublisherRanking,
    dataForAI: JSON.stringify({
      type: "publisher_yoy",
      currencyCode: payload.currencyCode,
      reportingPeriod: payload.reportingPeriod,
      comparisonPeriod: payload.comparisonPeriod,
      stats: {
        totalPublishers: mapped.length,
        categoryCurrentRows: categoryCurrentRows.length,
        categoryPreviousRows: categoryPreviousRows.length,
        sourceMetadataRows: sourceRows.length
      },
      tables: publisherTables
    }, null, 2)
  };
}

function buildSegmentSummary(rows, symbol) {
  const map = new Map();
  for (const row of rows) {
    const segment = row.Segment || "Other";
    if (!map.has(segment)) map.set(segment, { segment, sales: 0, prevSales: 0, ov: 0, prevOV: 0, publishers: 0 });
    const acc = map.get(segment);
    acc.sales += row._sales;
    acc.prevSales += row._prevSales;
    acc.ov += row._ov;
    acc.prevOV += row._prevOV;
    acc.publishers += 1;
  }
  return Array.from(map.values())
    .sort((a, b) => b.ov - a.ov)
    .slice(0, 5)
    .map((row) => ({
      Segment: row.segment,
      "Total Sales": fmtInt(row.sales),
      "Sales YoY %": fmtVar1(varPct(row.sales, row.prevSales)),
      "Total OV": fmtMoney0(row.ov, symbol),
      "OV YoY %": fmtVar1(varPct(row.ov, row.prevOV)),
      Publishers: fmtInt(row.publishers)
    }));
}

function categoryName(row) {
  return asText(row.categoryName || row.category || row.publisherCategoryName || row.publisherCategory || "Other", "Other");
}

function aggregateCategories(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const category = categoryName(row);
    if (!map.has(category)) {
      map.set(category, { category, sales: 0, orderValue: 0, clicks: 0 });
    }
    const acc = map.get(category);
    acc.sales += safeNum(row.sales) + safeNum(row.iSales);
    acc.orderValue += pickMax(row.orderValue, row.salesOrderValue, row.iSalesOrderValue);
    acc.clicks += safeNum(row.clicks);
  }
  return Array.from(map.values());
}

function buildCategorySegmentSummary(currentRows, previousRows, symbol) {
  const current = aggregateCategories(currentRows);
  const previousByCategory = new Map(aggregateCategories(previousRows).map((row) => [row.category.toLowerCase(), row]));
  return current
    .filter((row) => row.orderValue > 0 || row.sales > 0 || row.clicks > 0)
    .map((row) => {
      const previous = previousByCategory.get(row.category.toLowerCase()) || { sales: 0, orderValue: 0 };
      return {
        Segment: row.category,
        "Total Sales": fmtInt(row.sales),
        "Sales YoY %": fmtVar1(varPct(row.sales, previous.sales)),
        "Total OV": fmtMoney0(row.orderValue, symbol),
        "OV YoY %": fmtVar1(varPct(row.orderValue, previous.orderValue))
      };
    })
    .sort((a, b) => safeNum(b["Total OV"]) - safeNum(a["Total OV"]));
}

function dedupeSources(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sourceId = asText(row.sourceId || row.sourceID || row.source?.id || row.publisher?.id || row.id);
    const sourceName = asText(row.sourceName || row.name || row.publisher?.name);
    const key = `${asText(row.programId)}:${sourceId || sourceName.toLowerCase()}`;
    if (!key.endsWith(":")) map.set(key, row);
  }
  return Array.from(map.values());
}

function sourceAvailablePublisherCount(row) {
  const candidates = [
    row.publisherTypeAvailableCount,
    row.availablePublisherCount,
    row.availablePublishers,
    row.sourcePublisherCount,
    row.totalPublisherCount,
    row.totalPublishers,
    row.publisherCount
  ];
  for (const value of candidates) {
    if (value === null || value === undefined || value === "") continue;
    const count = Number(value);
    if (Number.isFinite(count) && count >= 0) return count;
  }
  return null;
}

function buildPublisherCategorySlides(sourceRows) {
  const groups = new Map();
  for (const row of sourceRows || []) {
    const category = sourcePromotionTypeName(row);
    const programId = asText(row.programId || row.publisherProgramId || row["Program ID"] || "Publisher Recommendations");
    const key = `${programId}|${category}`;
    if (!groups.has(key)) groups.set(key, { programId, category, rows: [], publisherCount: 0 });
    const group = groups.get(key);
    group.rows.push(row);
    const availableCount = sourceAvailablePublisherCount(row);
    if (availableCount !== null) group.publisherCount = Math.max(group.publisherCount, availableCount);
  }
  return Array.from(groups.values())
    .map((group) => {
      const publisherCount = Math.max(group.publisherCount || 0, group.rows.length);
      return {
        programId: group.programId,
        category: group.category,
        publisherCount,
        totalPublishers: publisherCount,
        recommendation: `Review the top 10 unconnected ${group.category} publishers ranked by total connections and acceptance ratio to identify expansion targets for the programme.`,
        evidence: [`${publisherCount} available publisher source(s); ${Math.min(10, group.rows.length)} included in the ranked recommendation detail.`],
        recommendedPublishers: group.rows
          .sort((a, b) => {
            const aTotal = safeNum(a.totalConnections) || safeNum(a.acceptedConnections) + safeNum(a.rejectedConnections);
            const bTotal = safeNum(b.totalConnections) || safeNum(b.acceptedConnections) + safeNum(b.rejectedConnections);
            return bTotal - aTotal
              || safeNum(b.acceptanceRatio) - safeNum(a.acceptanceRatio)
              || safeNum(b.acceptedConnections) - safeNum(a.acceptedConnections);
          })
          .slice(0, 10)
          .map((row) => ({
            "Program ID": asText(row.programId || group.programId),
            "Publisher Type": group.category,
            "Promotion Type": group.category,
            "Publisher Name": asText(row.sourceName || row.name || row.publisher?.name, "Unknown Publisher"),
            "Source ID": asText(row.sourceId || row.sourceID || row.id || row.source?.id),
            Description: asText(row.description),
            URL: asText(row.url),
            "Total Connections": fmtInt(safeNum(row.totalConnections) || safeNum(row.acceptedConnections) + safeNum(row.rejectedConnections)),
            "Acceptance Ratio": row.acceptanceRatio === null || row.acceptanceRatio === undefined ? "N/A" : `${safeNum(row.acceptanceRatio).toFixed(1)}%`,
            "Accepted Connections": fmtInt(row.acceptedConnections),
            "Rejected Connections": fmtInt(row.rejectedConnections)
          }))
      };
    })
    .filter((slide) => slide.recommendedPublishers.length);
}
function slideBlueprint(hasCategorySlides, requestedSlides) {
  const core = [
    { key: "cover", title: "Quarterly Business Review Cover" },
    { key: "reporting_overview", title: "Reporting Period Overview" },
    { key: "program_exec_summary", title: "Program Performance Executive Summary" },
    { key: "kpi_volume_conversion", title: "KPI Summary - Volume & Conversion" },
    { key: "kpi_cost_roi", title: "KPI Summary - Cost, CPA & ROI" },
    { key: "kpi_implications", title: "KPI Highlights & Business Implications" },
    { key: "publisher_overview", title: "Publisher Performance Overview" },
    { key: "top_publisher_performance", title: "Top Publisher Performance" },
    { key: "publisher_performance_by_program", title: "Publisher Performance by Program" },
    { key: "movers_sales", title: "Movers & Shakers - Sales" },
    { key: "movers_ov", title: "Movers & Shakers - Order Value" },
    { key: "movers_clicks", title: "Movers & Shakers - Clicks" },
    { key: "movers_aov", title: "Movers & Shakers - AOV" },
    { key: "segment_performance", title: "Publisher Segment Performance" },
    { key: "brand_new_publishers", title: "Brand New Publishers" }
  ];
  const closing = [
    ...(hasCategorySlides ? [{ key: "publisher_expansion_opportunities", title: "Publisher Expansion Opportunities" }] : []),
    { key: "new_emerging_publishers", title: "New & Emerging Publishers" },
    { key: "recommendations", title: "Strategic Recommendations" },
    { key: "risks_dependencies", title: "Risks & Dependencies" },
    { key: "thank_you", title: "Thank You" },
    { key: "questions_next_steps", title: "Questions & Next Steps" }
  ];
  const all = [...core, ...closing].map((slide, index) => ({ slide: index + 1, ...slide }));
  const target = hasCategorySlides ? all.length : Math.min(Number(requestedSlides || all.length), all.length);
  return { blueprint: all.slice(0, target), targetSlides: target };
}

function buildPptxPayload(parts) {
  const { payload, program, publisher, programAgent, publisherAgent } = parts;
  const hasCategorySlides = publisher.publisherCategorySlides.length > 0;
  const slides = slideBlueprint(hasCategorySlides, payload.n_slides ?? payload.targetSlides ?? payload.target_slides);
  const client = payload.programName || payload.clientName || "Unknown";
  const presentonAdditionalInstructions = [
    `Write all narrative text in ${payload.languageName}.`,
    "Use UK number formatting only: 1,234.56. Use currency symbol before values. Use % symbol for rates.",
    `Clearly state reporting period (${payload.reportingPeriod}) and YoY comparison period (${payload.comparisonPeriod}).`,
    `Primary QBR focus: ${payload.qbrFocus}. ${payload.qbrFocusDetail ? `Detail: ${payload.qbrFocusDetail}.` : ""}`,
    "Slide routing mode: use provided slides_markdown in strict order. Do not reorder, merge, or skip slides."
  ].filter(Boolean).join("\n");

  return {
    client,
    deckTitle: `QBR - ${client}`,
    targetSlides: slides.targetSlides,
    templateSlideCount: slides.blueprint.length,
    slideBlueprint: slides.blueprint,
    slideTableBindings: SLIDE_TABLE_BINDINGS,
    reportingPeriod: payload.reportingPeriod,
    comparisonPeriod: payload.comparisonPeriod,
    qbrFocus: payload.qbrFocus,
    qbrFocusDetail: payload.qbrFocusDetail,
    analysisLevel: payload.analysisLevel,
    organizationId: payload.organizationId,
    programId: payload.programId,
    programOutput: programAgent.output,
    programYoYTable: program.programYoYTable,
    programScopeTable: program.programScopeTable,
    programInsights: programAgent.insights,
    publisherAnalysis: publisherAgent.output,
    publisherInsights: publisherAgent.insights,
    publisherTables: publisher.publisherTables,
    publisherCategorySlides: publisher.publisherCategorySlides,
    publisherRecommendationPack: {},
    publisherOrderValueRanking: publisher.publisherOrderValueRanking,
    brandNewPublisherRanking: publisher.brandNewPublisherRanking,
    languageCode: payload.languageCode,
    languageName: payload.languageName,
    currencyCode: payload.currencyCode,
    presentonTemplateId: asText(payload.presentonTemplateId || payload.templateId),
    presentonAdditionalInstructions,
    presentonExportAs: asText(payload.presentonExportAs || "pptx"),
    presentonApiUrl: asText(payload.presentonApiUrl)
  };
}

function validatePptxPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("PPTX payload is required.");
  if (!payload.client) throw new Error("PPTX payload client is required.");
  if (!payload.publisherTables || typeof payload.publisherTables !== "object") throw new Error("PPTX payload publisherTables is required.");
  if (!Array.isArray(payload.slideBlueprint) || !payload.slideBlueprint.length) throw new Error("PPTX payload slideBlueprint is required.");
  if (!Array.isArray(payload.programYoYTable) || payload.programYoYTable.length < 4) throw new Error("PPTX payload programYoYTable requires four rows.");
  const requiredTables = ["top10ByOV", "topPublisherPerformance", "moversShakersSales", "moversShakersOV", "moversShakersClicks", "moversShakersAOV", "segmentSummary"];
  for (const key of requiredTables) {
    if (!Array.isArray(payload.publisherTables[key])) throw new Error(`PPTX payload publisherTables.${key} must be an array.`);
  }
  return true;
}

function projectGeneratorResponse(data) {
  const ok = data?.success !== false;
  const pptxUrl = data?.pptx_url || data?.presentation_url || data?.download_url || null;
  const publisherPerformanceExcelUrl = data?.publisher_performance_excel_url
    || data?.publisher_program_performance_excel_url
    || data?.publisher_performance_by_program_url
    || null;
  const bundleUrl = data?.bundle_url
    || data?.qbr_bundle_url
    || null;
  const presenterNotesUrl = data?.presenter_notes_url
    || data?.presenterNotesUrl
    || null;
  if (!ok) {
    return {
      success: false,
      error: data?.error || data?.message || "PPTX generation failed"
    };
  }
  const projected = {
    pptx_url: pptxUrl,
    qbr_bundle_url: bundleUrl,
    presenter_notes_url: presenterNotesUrl,
    gap_analysis_report_url: data?.gap_analysis_report_url || data?.publisher_recommendations_excel_url || null,
    publisher_program_performance_excel_url: publisherPerformanceExcelUrl
  };
  if (data?.presenter_notes_warning) projected.presenter_notes_warning = data.presenter_notes_warning;
  return projected;
}

function tableRowCounts(pptxPayload) {
  const counts = {
    programYoYTable: pptxPayload.programYoYTable.length,
    programScopeTable: Array.isArray(pptxPayload.programScopeTable) ? pptxPayload.programScopeTable.length : 0
  };
  for (const [key, value] of Object.entries(pptxPayload.publisherTables || {})) {
    counts[`publisherTables.${key}`] = Array.isArray(value) ? value.length : 0;
  }
  return counts;
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/authorization|password|secret|cookie|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer/i.test(key)) {
      return [key, item ? "[redacted]" : item];
    }
    return [key, redactSensitive(item)];
  }));
}

async function writeDebugArtifact(debugDir, artifact, now) {
  if (!debugDir) return null;
  await fs.mkdir(debugDir, { recursive: true });
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(debugDir, `advertiser-qbr-${stamp}.json`);
  await fs.writeFile(filePath, JSON.stringify(redactSensitive(artifact), null, 2));
  return filePath;
}

function createAdvertiserQbrRunner(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const generatorUrl = options.generatorUrl || DEFAULT_GENERATOR_URL;
  const pptxApiKey = options.pptxApiKey || DEFAULT_PPTX_API_KEY;
  const debugDir = options.debugDir || process.env.ADVERTISER_QBR_DEBUG_DIR || "";
  const now = options.now || Date.now;
  const agent = options.agent || createAdvertiserQbrAgent({
    mode: options.agentMode,
    apiKey: options.openaiApiKey,
    model: options.openaiModel,
    maxIterations: options.maxIterations,
    fetchImpl
  });
  const publisherNarrativeAgent = options.publisherAgent || createAdvertiserQbrAgent({
    mode: "deterministic",
    fetchImpl
  });

  async function run(input) {
    try {
      const incoming = normalizeIncomingRequest(input);
      const normalized = normalizeQbrPayload(incoming.payload, { now });
      const context = {
        fetchImpl,
        tdTokens: incoming.tdTokens,
        payload: normalized.payload,
        prev: normalized.prev
      };
      const programIds = normalized.payload.publisherProgramIds.length
        ? normalized.payload.publisherProgramIds
        : normalized.payload.analysisProgramIds;

      const [currentProgramRows, previousProgramRows] = await Promise.all([
        fetchPaginatedStatistics(context, "current"),
        fetchPaginatedStatistics(context, "previous")
      ]);
      const [publisherCurrentRows, publisherPreviousRows, categoryCurrentRows, categoryPreviousRows, sourceMetadataRows] = await Promise.all([
        fetchPublisherRows(context, "current", programIds),
        fetchPublisherRows(context, "previous", programIds),
        fetchCategoryRows(context, "current", programIds),
        fetchCategoryRows(context, "previous", programIds),
        fetchPublisherSourceMetadata(context, programIds)
      ]);

      const program = processProgramData(currentProgramRows, previousProgramRows, normalized.payload);
      const publisher = processPublisherPack(
        publisherCurrentRows,
        publisherPreviousRows,
        categoryCurrentRows,
        categoryPreviousRows,
        sourceMetadataRows,
        normalized.payload
      );
      const [programAgent, publisherAgent] = await Promise.all([
        agent.run({ kind: "program", dataForAI: program.dataForAI, payload: normalized.payload }),
        publisherNarrativeAgent.run({ kind: "publisher", dataForAI: publisher.dataForAI, payload: normalized.payload })
      ]);
      const finalPptxPayload = buildPptxPayload({ payload: normalized.payload, program, publisher, programAgent, publisherAgent });
      validatePptxPayload(finalPptxPayload);

      await writeDebugArtifact(debugDir, {
        normalizedInput: { ...incoming, payload: normalized.payload },
        fetchedRowCounts: {
          currentProgramRows: currentProgramRows.length,
          previousProgramRows: previousProgramRows.length,
          publisherCurrentRows: publisherCurrentRows.length,
          publisherPreviousRows: publisherPreviousRows.length,
          categoryCurrentRows: categoryCurrentRows.length,
          categoryPreviousRows: categoryPreviousRows.length,
          sourceMetadataRows: sourceMetadataRows.length
        },
        tableRowCounts: tableRowCounts(finalPptxPayload),
        finalPptxPayload,
        agentOutputPreview: {
          program: programAgent.output.slice(0, 1000),
          publisher: publisherAgent.output.slice(0, 1000)
        }
      }, now);

      const generatorResponse = await fetchJsonWithRetry(fetchImpl, generatorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-api-key": pptxApiKey
        },
        body: JSON.stringify(finalPptxPayload)
      }, "PPTX /generate", { timeoutMs: 300000, retries: 0 });
      return projectGeneratorResponse(generatorResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        provider: "advertiser-qbr-local-runner",
        message: `Advertiser QBR local runner failed: ${message}`,
        generation_status: "failed",
        generation_id: null,
        presentation_id: null,
        presentation_url: null,
        edit_url: null,
        pptx_url: null,
        qbr_bundle_url: null,
        presenter_notes_url: null,
        gap_analysis_report_url: null,
        gap_analysis_report_file_name: null,
        publisher_performance_excel_url: null,
        publisher_performance_excel_file_name: null,
        publisher_program_performance_excel_url: null,
        publisher_program_performance_excel_file_name: null,
        publisher_performance_by_program_url: null,
        publisher_performance_by_program_file_name: null,
        file_name: null,
        theme: null,
        slide_count: null,
        error: message
      };
    }
  }

  return { run };
}

module.exports = {
  normalizeIncomingRequest,
  normalizeQbrPayload,
  createAdvertiserQbrRunner,
  redactSensitive,
  validatePptxPayload,
  projectGeneratorResponse,
  processProgramData,
  processPublisherPack
};
