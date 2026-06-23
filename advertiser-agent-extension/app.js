const DEFAULTS = {
  oauthUrl: "https://connect.tradedoubler.com/uaa/oauth/token",
  impersonateUrl: "https://connect.tradedoubler.com/uaa/admin/impersonate?username=",
  advertiserBase: "https://connect.tradedoubler.com/advertiser/",
  oauthBasic: "dGRjb25uZWN0X3B1Ymxpc2hlcjoxMjM0NTY=",
  qbrWebhookUrl: "http://127.0.0.1:5678/webhook/agency-agent-qbr-backend-auth-20260610",
  backendApiUrl: "http://127.0.0.1:8008/api"
};
const STORAGE_KEYS = {
  connectionConfig: "advertiserAgentConnectionConfig"
};
const form = document.getElementById("advertiserForm");
const testApiButton = document.getElementById("testApi");
const submitButton = document.getElementById("submitRequest");
const adminUsernameInput = document.getElementById("adminUsername");
const adminPasswordInput = document.getElementById("adminPassword");
const qbrWebhookUrlInput = document.getElementById("qbrWebhookUrl");
const backendApiUrlInput = document.getElementById("backendApiUrl");
const oauthUrlInput = document.getElementById("oauthUrl");
const impersonateUrlInput = document.getElementById("impersonateUrl");
const advertiserBaseInput = document.getElementById("advertiserBase");
const oauthBasicInput = document.getElementById("oauthBasic");
const accessTokenInput = document.getElementById("accessToken");
const clientUsernameInput = document.getElementById("clientUsername");
const impersonateClientButton = document.getElementById("impersonateClient");
const loadProgramsButton = document.getElementById("loadPrograms");
const clearSessionButton = document.getElementById("clearSession");
const programStatus = document.getElementById("programStatus");
const programList = document.getElementById("programList");
const programSelectionCount = document.getElementById("programSelectionCount");
const selectAllProgramsButton = document.getElementById("selectAllPrograms");
const clearProgramsButton = document.getElementById("clearPrograms");
const dateFromInput = document.getElementById("dateFrom");
const dateToInput = document.getElementById("dateTo");
const rangePreview = document.getElementById("rangePreview");
const summaryList = document.getElementById("summaryList");
const statusOutput = document.getElementById("statusOutput");
const resultLink = document.getElementById("resultLink");
const batchFileInput = document.getElementById("batchFile");
const runBatchButton = document.getElementById("runBatch");
const batchPreview = document.getElementById("batchPreview");
const batchResults = document.getElementById("batchResults");
const refreshRunLogButton = document.getElementById("refreshRunLog");
const runLogMeta = document.getElementById("runLogMeta");
const runLogTable = document.getElementById("runLogTable");

let programs = [];
let selectedProgramIds = [];
let impersonatedClientUsername = "";
let batchRows = [];
let currentBatchResultsUrl = "";

function normalizeBaseUrl(value, fallback = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function ensureTrailingSlash(value) {
  const text = String(value || "").trim();
  return text.endsWith("/") ? text : `${text}/`;
}

function normalizeDate(date) {
  return String(date || "").replaceAll("-", "");
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

function getStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (items) => resolve(items[key]));
  });
}

function setStorageValue(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

function getConnectionConfig() {
  return {
    adminUsername: adminUsernameInput.value.trim(),
    adminPassword: adminPasswordInput.value,
    oauthUrl: oauthUrlInput.value.trim() || DEFAULTS.oauthUrl,
    impersonateUrl: impersonateUrlInput.value.trim() || DEFAULTS.impersonateUrl,
    advertiserBase: ensureTrailingSlash(advertiserBaseInput.value.trim() || DEFAULTS.advertiserBase),
    oauthBasic: oauthBasicInput.value.trim() || DEFAULTS.oauthBasic,
    qbrWebhookUrl: normalizeBaseUrl(qbrWebhookUrlInput.value.trim(), DEFAULTS.qbrWebhookUrl),
    backendApiUrl: normalizeBaseUrl(backendApiUrlInput.value.trim(), DEFAULTS.backendApiUrl)
  };
}

async function saveConnectionConfig() {
  const cfg = getConnectionConfig();
  await setStorageValue(STORAGE_KEYS.connectionConfig, {
    adminUsername: cfg.adminUsername,
    oauthUrl: cfg.oauthUrl,
    impersonateUrl: cfg.impersonateUrl,
    advertiserBase: cfg.advertiserBase,
    oauthBasic: cfg.oauthBasic,
    qbrWebhookUrl: cfg.qbrWebhookUrl,
    backendApiUrl: cfg.backendApiUrl
  });
  return cfg;
}

function applyConnectionConfig(cfg = {}) {
  adminUsernameInput.value = cfg.adminUsername || "";
  adminPasswordInput.value = "";
  oauthUrlInput.value = cfg.oauthUrl || DEFAULTS.oauthUrl;
  impersonateUrlInput.value = cfg.impersonateUrl || DEFAULTS.impersonateUrl;
  advertiserBaseInput.value = cfg.advertiserBase || DEFAULTS.advertiserBase;
  oauthBasicInput.value = cfg.oauthBasic || DEFAULTS.oauthBasic;
  qbrWebhookUrlInput.value = cfg.qbrWebhookUrl || DEFAULTS.qbrWebhookUrl;
  backendApiUrlInput.value = cfg.backendApiUrl || DEFAULTS.backendApiUrl;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (result) => {
      if (chrome.runtime.lastError) {
        const rawMessage = chrome.runtime.lastError.message || "Chrome runtime message failed.";
        const reloadHint = /message port closed|receiving end does not exist/i.test(rawMessage)
          ? " Reload the unpacked extension in chrome://extensions, then reopen the extension page."
          : "";
        reject(new Error(`${rawMessage}${reloadHint}`));
        return;
      }
      resolve(result);
    });
  });
}

async function sendExtensionRequest(message) {
  const result = await sendRuntimeMessage({
    ...message,
    cfg: getConnectionConfig()
  });

  if (!result || !result.ok) {
    throw new Error(result?.error || "The extension service worker did not return a response.");
  }

  return result.data;
}

function formatRunTimestamp(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function runLogValue(run, key, fallback = "-") {
  const value = String(run?.[key] || "").trim();
  return value || fallback;
}

function renderRunLog(runs) {
  runLogTable.replaceChildren();
  const rows = Array.isArray(runs) ? runs : [];
  const uniquePrograms = new Set(rows.map((run) => run.programId).filter(Boolean)).size;
  runLogMeta.textContent = `${rows.length} run${rows.length === 1 ? "" : "s"} | ${uniquePrograms} primary program${uniquePrograms === 1 ? "" : "s"}`;

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No program requests have been recorded yet.";
    runLogTable.append(empty);
    return;
  }

  const columns = [
    ["Client", "clientUsername"],
    ["Program IDs", "programIds"],
    ["Program Names", "programNames"],
    ["Date Range", "dateRange"],
    ["Language", "languageCode"],
    ["Currency", "currencyCode"],
    ["Timestamp", "timestamp"]
  ];

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");

  for (const [label] of columns) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);

  for (const run of rows) {
    const row = document.createElement("tr");
    for (const [, key] of columns) {
      const cell = document.createElement("td");
      if (key === "programIds") cell.className = "mono-cell";
      if (key === "timestamp") {
        cell.textContent = formatRunTimestamp(run.timestamp);
      } else if (key === "dateRange") {
        const startDate = runLogValue(run, "startDate", "");
        const endDate = runLogValue(run, "endDate", "");
        cell.textContent = startDate && endDate ? `${startDate} to ${endDate}` : "-";
      } else if (key === "programIds") {
        cell.textContent = runLogValue(run, "programIds", runLogValue(run, "programId"));
      } else {
        cell.textContent = runLogValue(run, key);
      }
      row.append(cell);
    }
    tbody.append(row);
  }

  table.append(thead, tbody);
  runLogTable.append(table);
}

async function fetchRunLogDirect(limit = 50) {
  const cfg = getConnectionConfig();
  const response = await fetch(`${cfg.backendApiUrl}/program-request-runs?limit=${encodeURIComponent(limit)}`, {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`Run log API failed: HTTP ${response.status}`);
  return response.json();
}

async function backendJson(path, init = {}) {
  const cfg = getConnectionConfig();
  const response = await fetch(`${cfg.backendApiUrl}${path}`, {
    ...init,
    headers: {
      "Accept": "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }
  if (!response.ok) {
    const detail = data && typeof data === "object" ? data.detail || data.message || data.error : String(data || "");
    throw new Error(`Batch manifest API failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }
  return data;
}

async function createBatchRunManifest(rowCount) {
  const data = await backendJson("/batch-runs", {
    method: "POST",
    body: JSON.stringify({
      source: "advertiser-agent-extension",
      rowCount
    })
  });
  return data.batch;
}

async function recordBatchRunManifestItem(batchId, row, payload) {
  const data = await backendJson(`/batch-runs/${encodeURIComponent(batchId)}/items`, {
    method: "POST",
    body: JSON.stringify({
      rowNumber: row.rowNumber,
      clientUsername: payload.clientUsername,
      programIds: payload.advertiserProgramIds,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: row.status,
      duplicate: Boolean(row.duplicate),
      resultUrl: row.resultUrl || "",
      error: row.error || "",
      requestKey: buildBatchRequestKey(payload)
    })
  });
  return data.batch;
}

function buildBatchRequestKey(payload) {
  const clientUsername = String(payload.clientUsername || "").trim().toLowerCase();
  const programIds = Array.from(new Set((payload.advertiserProgramIds || []).map((id) => String(id || "").trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  if (!clientUsername || !programIds.length || !payload.startDate || !payload.endDate) return "";
  return `${clientUsername}|${programIds.join(",")}|${payload.startDate}|${payload.endDate}`;
}

function getBatchRows(batch) {
  return Array.isArray(batch?.rows) ? batch.rows : [];
}

function getBatchRowPrograms(row) {
  if (Array.isArray(row.advertiserProgramIds)) return row.advertiserProgramIds.join(", ");
  return String(row.programIds || "");
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildBatchResultsCsv(batch) {
  const header = ["rowNumber", "clientUsername", "programIds", "startDate", "endDate", "status", "duplicate", "resultUrl", "error"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of getBatchRows(batch)) {
    lines.push([
      row.rowNumber,
      row.clientUsername,
      getBatchRowPrograms(row),
      row.startDate,
      row.endDate,
      row.status,
      Boolean(row.duplicate),
      row.resultUrl,
      row.error
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

function createBatchResultsCsvUrl(batch) {
  if (currentBatchResultsUrl) URL.revokeObjectURL(currentBatchResultsUrl);
  const blob = new Blob([buildBatchResultsCsv(batch)], { type: "text/csv;charset=utf-8" });
  currentBatchResultsUrl = URL.createObjectURL(blob);
  return currentBatchResultsUrl;
}

function summarizeBatch(batch) {
  const rows = getBatchRows(batch);
  const rowCount = Number(batch?.rowCount || rows.length || 0);
  const successCount = Number(batch?.successCount ?? rows.filter((row) => row.status === "success").length);
  const duplicateCount = Number(batch?.duplicateCount ?? rows.filter((row) => row.duplicate || row.status === "duplicate").length);
  const errorCount = Number(batch?.errorCount ?? rows.filter((row) => row.status === "error").length);
  return { rowCount, successCount, duplicateCount, errorCount };
}

function renderBatchResults(batch) {
  batchResults.replaceChildren();
  const rows = getBatchRows(batch);
  if (!batch || !rows.length) {
    batchResults.textContent = "Batch results will appear here after a run.";
    return;
  }

  const counts = summarizeBatch(batch);
  const summary = document.createElement("p");
  summary.textContent = `${counts.rowCount} rows | ${counts.successCount} succeeded | ${counts.duplicateCount} duplicates | ${counts.errorCount} failed`;
  batchResults.append(summary);

  const actions = document.createElement("div");
  actions.className = "batch-actions";
  const csvLink = document.createElement("a");
  csvLink.href = createBatchResultsCsvUrl(batch);
  csvLink.download = `${batch.id || "batch-results"}.csv`;
  csvLink.textContent = "Download batch results CSV";
  actions.append(csvLink);
  batchResults.append(actions);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headerRow = document.createElement("tr");
  for (const label of ["Row", "Client", "Programs", "Date Range", "Status", "Result"] ) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);

  for (const row of rows) {
    const tr = document.createElement("tr");
    const resultCell = document.createElement("td");
    if (row.resultUrl) {
      const link = document.createElement("a");
      link.href = resolveResultUrl(row.resultUrl);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open PPTX";
      resultCell.append(link);
    } else {
      resultCell.textContent = row.error || "-";
    }

    const values = [
      row.rowNumber,
      row.clientUsername || "-",
      getBatchRowPrograms(row) || "-",
      row.startDate && row.endDate ? `${row.startDate} to ${row.endDate}` : "-",
      row.status || "running"
    ];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      if (value === row.status) td.className = `status-${row.status}`;
      tr.append(td);
    }
    tr.append(resultCell);
    tbody.append(tr);
  }

  table.append(thead, tbody);
  batchResults.append(table);
}
async function refreshRunLog() {
  refreshRunLogButton.disabled = true;
  runLogMeta.textContent = "Loading run log...";

  try {
    let data;
    try {
      data = await sendExtensionRequest({ type: "LIST_PROGRAM_REQUEST_RUNS", limit: 50 });
    } catch (error) {
      if (!/Unknown message type: LIST_PROGRAM_REQUEST_RUNS/i.test(error.message || "")) throw error;
      data = await fetchRunLogDirect(50);
    }
    renderRunLog(data.runs || []);
  } catch (error) {
    runLogTable.replaceChildren();
    runLogMeta.textContent = "Run log unavailable.";
    const message = document.createElement("p");
    message.className = "error-text";
    message.textContent = error.message;
    runLogTable.append(message);
  } finally {
    refreshRunLogButton.disabled = false;
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.entries(value).reduce((next, [key, item]) => {
    if (/token|authorization|password|secret/i.test(key)) {
      next[key] = item ? "[redacted]" : item;
      return next;
    }
    next[key] = redact(item);
    return next;
  }, {});
}

function writeStatus(label, value) {
  statusOutput.textContent = `${label}\n${JSON.stringify(redact(value), null, 2)}`;
}

function clearResultLink() {
  resultLink.replaceChildren();
}

function appendResultLink(label, href) {
  if (!href) return;

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  resultLink.append(link);
}

function showResultLink(label, href) {
  clearResultLink();
  appendResultLink(label, href);
}

function showBatchDownloadLinks(batch) {
  clearResultLink();
  if (!getBatchRows(batch).length) return;
  const link = document.createElement("a");
  link.href = createBatchResultsCsvUrl(batch);
  link.download = `${batch.id || "batch-results"}.csv`;
  link.textContent = "Download batch results CSV";
  resultLink.append(link);
}

function getPrimaryProgram() {
  const primaryId = selectedProgramIds[0] || "";
  return programs.find((program) => program.id === primaryId) || null;
}

function getSelectedPrograms() {
  const selected = selectedProgramIds
    .map((programId) => programs.find((program) => program.id === programId))
    .filter(Boolean);
  return selected.length ? selected : getPrimaryProgram() ? [getPrimaryProgram()] : [];
}

function getFormPayload() {
  const data = new FormData(form);
  const primaryProgram = getPrimaryProgram();
  const selectedPrograms = getSelectedPrograms();
  const programIds = selectedPrograms.map((program) => program.id);
  const programNames = selectedPrograms.map((program) => program.name);

  return {
    type: "ADVERTISER_AGENT_REQUEST",
    analysisLevel: "program",
    clientUsername: String(data.get("clientUsername") || "").trim(),
    programId: primaryProgram?.id || "",
    programName: programNames.length > 1 ? `${primaryProgram?.name || "Selected programs"} + ${programNames.length - 1} more` : primaryProgram?.name || "",
    advertiserProgramIds: programIds,
    publisherProgramIds: programIds,
    analysisProgramIds: programIds,
    programNames,
    advertiserPrograms: selectedPrograms.map((program) => ({
      id: program.id,
      name: program.name,
      ...(program.countryCode ? { countryCode: program.countryCode } : {})
    })),
    languageCode: data.get("languageCode"),
    currencyCode: data.get("currencyCode"),
    startDate: data.get("dateFrom"),
    endDate: data.get("dateTo"),
    fromDate: normalizeDate(data.get("dateFrom")),
    toDate: normalizeDate(data.get("dateTo")),
    tdSession: {
      mode: "extension_advertiser_impersonation",
      tokensIncluded: false
    },
    requestedFrom: "advertiser-agent-extension"
  };
}

function findFirstValue(data, keys) {
  if (!data || typeof data !== "object") return "";

  for (const key of keys) {
    if (data[key]) return data[key];
  }

  for (const value of Object.values(data)) {
    const nested = findFirstValue(value, keys);
    if (nested) return nested;
  }

  return "";
}

function getResultUrl(data) {
  return findFirstValue(data, ["reportUrl", "resultUrl", "downloadUrl", "download_url", "pptx_url", "file_url", "url"]);
}

function normalizeProgramItems(data) {
  const candidates = [
    data?.items,
    data?.programs,
    data?.results,
    data?.data?.items,
    data?.data?.programs
  ];
  return candidates.find((value) => Array.isArray(value)) || [];
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell)) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  if (row.some((cell) => cell)) rows.push(row);
  return rows;
}

function tableRowsToObjects(tableRows) {
  const headers = (tableRows[0] || []).map((header) => String(header || "").trim());
  return tableRows.slice(1).map((cells) =>
    headers.reduce((row, header, index) => {
      if (header) row[header] = cells[index] || "";
      return row;
    }, {})
  );
}

async function inflateRaw(bytes) {
  if (!globalThis.DecompressionStream) {
    throw new Error("XLSX parsing requires a browser with DecompressionStream support.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(buffer, wantedNames) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("XLSX file is missing a ZIP directory.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder();
  const entries = {};

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (wantedNames.has(name)) {
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const inflated = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
      if (!inflated) throw new Error(`Unsupported XLSX ZIP compression method: ${method}`);
      entries[name] = decoder.decode(inflated);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseSharedStrings(xmlText) {
  if (!xmlText) return [];
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((si) =>
    Array.from(si.getElementsByTagName("t")).map((node) => node.textContent || "").join("")
  );
}

function parseWorksheetRows(xmlText, sharedStrings) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const rows = [];
  for (const rowNode of Array.from(doc.getElementsByTagName("row"))) {
    const row = [];
    for (const cell of Array.from(rowNode.getElementsByTagName("c"))) {
      const ref = cell.getAttribute("r") || "";
      const columnLetters = ref.replace(/[0-9]/g, "");
      const columnIndex = columnLetters.split("").reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const type = cell.getAttribute("t");
      const valueNode = cell.getElementsByTagName("v")[0];
      const inlineNode = cell.getElementsByTagName("t")[0];
      const rawValue = valueNode?.textContent || inlineNode?.textContent || "";
      row[columnIndex >= 0 ? columnIndex : row.length] = type === "s" ? sharedStrings[Number(rawValue)] || "" : rawValue;
    }
    if (row.some((cell) => cell)) rows.push(row.map((cell) => String(cell || "").trim()));
  }
  return rows;
}

async function parseXlsxRows(file) {
  const entries = await readZipEntries(await file.arrayBuffer(), new Set(["xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"]));
  if (!entries["xl/worksheets/sheet1.xml"]) {
    throw new Error("XLSX file does not contain xl/worksheets/sheet1.xml.");
  }
  const sharedStrings = parseSharedStrings(entries["xl/sharedStrings.xml"]);
  return tableRowsToObjects(parseWorksheetRows(entries["xl/worksheets/sheet1.xml"], sharedStrings));
}

async function parseBatchFile(file) {
  if (!file) return [];
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    return tableRowsToObjects(parseCsvRows(await file.text()));
  }
  if (extension === "xlsx") {
    return parseXlsxRows(file);
  }
  throw new Error("Upload a .csv or .xlsx file.");
}

function normalizeBatchKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getBatchCell(row, aliases) {
  const normalizedAliases = aliases.map(normalizeBatchKey);
  for (const [key, value] of Object.entries(row || {})) {
    if (normalizedAliases.includes(normalizeBatchKey(key))) return value;
  }
  return "";
}

function renderBatchPreview(rows, message = "") {
  batchPreview.replaceChildren();
  if (message) {
    batchPreview.textContent = message;
    return;
  }

  if (!rows.length) {
    batchPreview.textContent = "No batch rows loaded.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headers = [
    ["clientUsername", ["clientUsername", "username", "client email"]],
    ["programIds", ["programIds", "program IDs", "programId", "advertiserProgramIds"]],
    ["startDate", ["startDate", "start date", "dateFrom", "fromDate"]],
    ["endDate", ["endDate", "end date", "dateTo", "toDate"]],
    ["currencyCode", ["currencyCode", "currency"]],
    ["languageCode", ["languageCode", "language"]]
  ];
  const headerRow = document.createElement("tr");
  for (const [header] of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.append(th);
  }
  thead.append(headerRow);

  for (const row of rows.slice(0, 8)) {
    const tr = document.createElement("tr");
    for (const [, aliases] of headers) {
      const td = document.createElement("td");
      td.textContent = getBatchCell(row, aliases);
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.append(thead, tbody);
  batchPreview.append(table);
  if (rows.length > 8) {
    const more = document.createElement("p");
    more.textContent = `Showing 8 of ${rows.length} rows.`;
    batchPreview.append(more);
  }
}

function resolveResultUrl(value) {
  if (!value) return "";
  const url = String(value);
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(url)) return url;
  return url;
}

function renderPrograms() {
  programList.replaceChildren();

  if (programs.length === 0) {
    selectAllProgramsButton.disabled = true;
    clearProgramsButton.disabled = true;
    programSelectionCount.textContent = "No programs selected";

    const empty = document.createElement("p");
    empty.textContent = "Load programs first to choose report coverage.";
    programList.append(empty);
    return;
  }

  selectAllProgramsButton.disabled = false;
  clearProgramsButton.disabled = false;
  selectedProgramIds = selectedProgramIds.filter((programId) => programs.some((program) => program.id === programId));

  const optionGroup = document.createElement("div");
  optionGroup.className = "program-options";

  for (const program of programs) {
    const label = document.createElement("label");
    label.className = "program-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "programId";
    checkbox.value = program.id;
    checkbox.checked = selectedProgramIds.includes(program.id);

    const text = document.createElement("span");
    text.textContent = `${program.name} (${program.id})`;

    label.append(checkbox, text);
    optionGroup.append(label);
  }

  programList.append(optionGroup);
  const selectedProgram = getPrimaryProgram();
  const selectedCount = selectedProgramIds.length;
  programSelectionCount.textContent = selectedProgram
    ? `${selectedCount} of ${programs.length} selected`
    : `0 of ${programs.length} selected`;
}

function updateProgramStatus() {
  if (programs.length === 0) {
    programStatus.textContent = "No programs loaded.";
    return;
  }

  const selectedProgram = getPrimaryProgram();
  const selectedCount = selectedProgramIds.length;
  programStatus.textContent = selectedProgram
    ? `${programs.length} loaded, ${selectedCount} selected. Primary: ${selectedProgram.name}.`
    : `${programs.length} loaded, none selected.`;
}

function updateRangePreview() {
  const start = dateFromInput.value;
  const end = dateToInput.value;

  if (!start || !end) {
    rangePreview.textContent = "Select a period to preview.";
    return;
  }

  rangePreview.textContent = `From: ${start}\nTo: ${end}`;
}

function updateSummary() {
  const payload = getFormPayload();
  const items = [
    ["Client Username", payload.clientUsername || "Not set"],
    ["Impersonated", impersonatedClientUsername || "Not connected"],
    ["Primary Program", payload.programName || "None selected"],
    ["Program ID", payload.programId || "Not set"],
    ["Selected Program IDs", payload.advertiserProgramIds.length ? payload.advertiserProgramIds.join(", ") : "None selected"],
    ["Programs", String(payload.advertiserProgramIds.length)],
    ["Language / Currency", `${payload.languageCode} / ${payload.currencyCode}`],
    ["Date Range", payload.startDate && payload.endDate ? `${payload.startDate} to ${payload.endDate}` : "Not set"]
  ];

  summaryList.replaceChildren(
    ...items.map(([term, description]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = description;
      row.append(dt, dd);
      return row;
    })
  );

  updateRangePreview();
}

async function testApi() {
  clearResultLink();
  testApiButton.disabled = true;
  writeStatus("Saving TD connection settings...", {
    qbrWebhookUrl: qbrWebhookUrlInput.value,
    advertiserBase: advertiserBaseInput.value
  });

  try {
    const cfg = await saveConnectionConfig();
    const response = await sendExtensionRequest({ type: "SAVE_CONFIG" });
    writeStatus("TD connection settings saved", {
      ...response,
      qbrWebhookUrl: cfg.qbrWebhookUrl,
      advertiserBase: cfg.advertiserBase,
      backendApiUrl: cfg.backendApiUrl,
      passwordStored: false
    });
    return true;
  } catch (error) {
    writeStatus("TD connection settings failed", { error: error.message });
    return false;
  } finally {
    testApiButton.disabled = false;
  }
}

async function impersonateClient() {
  const clientUsername = clientUsernameInput.value.trim();
  if (!clientUsername) {
    writeStatus("Impersonation blocked", { error: "Client username is required." });
    return false;
  }

  impersonateClientButton.disabled = true;
  programStatus.textContent = "Impersonating client...";

  try {
    await saveConnectionConfig();
    const response = await sendExtensionRequest({
      type: "IMPERSONATE_CLIENT",
      username: clientUsername,
      bearerToken: accessTokenInput.value.trim()
    });

    impersonatedClientUsername = clientUsername;
    programStatus.textContent = `Impersonated ${clientUsername}.`;
    updateSummary();
    writeStatus("Client impersonated via extension", {
      username: clientUsername,
      data: response,
      tokenStoredInExtension: true
    });
    return true;
  } catch (error) {
    impersonatedClientUsername = "";
    updateSummary();
    programStatus.textContent = "Client impersonation failed.";
    writeStatus("Client impersonation failed", {
      error: error.message,
      hint: "Check admin credentials, OAuth Basic, and the client username. You can also provide an admin bearer token override."
    });
    return false;
  } finally {
    impersonateClientButton.disabled = false;
  }
}

async function loadPrograms() {
  const clientUsername = clientUsernameInput.value.trim();
  if (!clientUsername) {
    writeStatus("Program load blocked", { error: "Client username is required." });
    return;
  }

  loadProgramsButton.disabled = true;
  programStatus.textContent = "Loading programs...";

  try {
    if (impersonatedClientUsername !== clientUsername) {
      const didImpersonate = await impersonateClient();
      if (!didImpersonate) return;
    }

    const response = await sendExtensionRequest({
      type: "LIST_ADVERTISER_PROGRAMS",
      limit: 100
    });

    const items = normalizeProgramItems(response);
    programs = items
      .filter((item) => item?.active === true && item?.closedProgram !== true)
      .map((item) => {
        const countryCode = item.countryCode ? String(item.countryCode).trim().toUpperCase() : "";
        return {
          id: String(item.programId || item.id || ""),
          name: item.name || item.programName ? String(item.name || item.programName) : `Program ${item.programId || item.id}`,
          ...(countryCode ? { countryCode } : {})
        };
      })
      .filter((item) => item.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    selectedProgramIds = programs[0] ? [programs[0].id] : [];

    renderPrograms();
    updateProgramStatus();
    updateSummary();
    writeStatus("Advertiser programs loaded via extension impersonation", {
      programCount: programs.length,
      selectedProgramIds,
      tdSession: {
        mode: "extension_advertiser_impersonation",
        clientUsername,
        tokenStoredInExtension: true
      }
    });
  } catch (error) {
    programs = [];
    selectedProgramIds = [];
    renderPrograms();
    updateProgramStatus();
    updateSummary();
    writeStatus("Program load failed", {
      error: error.message,
      hint: "Impersonate the client first, then load programs again."
    });
  } finally {
    loadProgramsButton.disabled = false;
  }
}

async function clearSessionFields() {
  accessTokenInput.value = "";
  adminPasswordInput.value = "";
  clientUsernameInput.value = "";
  impersonatedClientUsername = "";
  programs = [];
  selectedProgramIds = [];
  renderPrograms();
  updateProgramStatus();
  updateSummary();

  try {
    await sendRuntimeMessage({ type: "CLEAR_STATE" });
    writeStatus("TD session cleared", { extensionTokenFieldCleared: true, extensionSessionCleared: true });
  } catch (error) {
    writeStatus("Extension fields cleared", {
      extensionTokenFieldCleared: true,
      extensionSessionClearError: error.message
    });
  }
}

async function handleBatchFileChange() {
  const file = batchFileInput.files?.[0];
  batchRows = [];
  runBatchButton.disabled = true;

  if (!file) {
    renderBatchPreview([], "Upload a file with clientUsername, programIds, startDate, endDate, currencyCode, and languageCode.");
    return;
  }

  try {
    batchRows = await parseBatchFile(file);
    runBatchButton.disabled = batchRows.length === 0;
    renderBatchPreview(batchRows);
    writeStatus("Batch file parsed", {
      fileName: file.name,
      rowCount: batchRows.length
    });
  } catch (error) {
    batchRows = [];
    runBatchButton.disabled = true;
    renderBatchPreview([], error.message);
    writeStatus("Batch file parse failed", { error: error.message });
  }
}

function splitBatchList(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildBatchPayload(row) {
  const clientUsername = String(getBatchCell(row, ["clientUsername", "username", "client email"]) || "").trim();
  const programIds = splitBatchList(getBatchCell(row, ["programIds", "program IDs", "programId", "advertiserProgramIds"]));
  const programNames = splitBatchList(getBatchCell(row, ["programNames", "program names", "programName"]));
  const startDate = String(getBatchCell(row, ["startDate", "start date", "dateFrom", "fromDate"]) || "").trim();
  const endDate = String(getBatchCell(row, ["endDate", "end date", "dateTo", "toDate"]) || "").trim();
  const currencyCode = String(getBatchCell(row, ["currencyCode", "currency"]) || form.currencyCode?.value || "EUR").trim();
  const languageCode = String(getBatchCell(row, ["languageCode", "language"]) || form.languageCode?.value || "EN").trim();

  return {
    type: "ADVERTISER_AGENT_REQUEST",
    analysisLevel: "program",
    clientUsername,
    programId: programIds[0] || "",
    programName: programNames[0] || (programIds[0] ? `Program ${programIds[0]}` : ""),
    advertiserProgramIds: programIds,
    publisherProgramIds: programIds,
    analysisProgramIds: programIds,
    programNames,
    languageCode,
    currencyCode,
    startDate,
    endDate,
    fromDate: normalizeDate(startDate),
    toDate: normalizeDate(endDate),
    tdSession: {
      mode: "extension_advertiser_impersonation",
      tokensIncluded: false
    },
    requestedFrom: "advertiser-agent-extension-batch"
  };
}

async function runBatch(event) {
  event?.preventDefault();
  event?.stopPropagation();
  clearResultLink();
  if (!batchRows.length) {
    writeStatus("Batch blocked", { error: "Upload a CSV or XLSX file first." });
    return;
  }

  runBatchButton.disabled = true;

  try {
    await saveConnectionConfig();
    let batch = await createBatchRunManifest(batchRows.length);
    renderBatchResults(batch);

    for (let index = 0; index < batchRows.length; index += 1) {
      const payload = buildBatchPayload(batchRows[index]);
      const row = {
        rowNumber: index + 1,
        clientUsername: payload.clientUsername,
        advertiserProgramIds: payload.advertiserProgramIds,
        programIds: payload.advertiserProgramIds.join(", "),
        startDate: payload.startDate,
        endDate: payload.endDate,
        status: "running",
        duplicate: false,
        resultUrl: "",
        error: ""
      };
      batch.rows = [...getBatchRows(batch), row];
      writeStatus(`Batch row ${row.rowNumber} of ${batchRows.length}`, batch);
      renderBatchResults(batch);

      try {
        const response = await sendExtensionRequest({
          type: "SUBMIT_QBR_REQUEST",
          payload,
          bearerToken: accessTokenInput.value.trim()
        });
        row.status = "success";
        row.result = response.data || response;
        row.resultUrl = getResultUrl(response.data || response);
      } catch (error) {
        row.duplicate = /^Duplicate QBR request blocked/i.test(error.message || "");
        row.status = row.duplicate ? "duplicate" : "error";
        row.error = error.message;
      }

      try {
        batch = await recordBatchRunManifestItem(batch.id, row, payload);
      } catch (error) {
        row.status = "error";
        row.error = `${row.error ? `${row.error} | ` : ""}Batch manifest logging failed: ${error.message}`;
      }
      writeStatus(`Batch row ${row.rowNumber} of ${batchRows.length}`, batch);
      renderBatchResults(batch);
    }

    writeStatus("Batch completed", batch);
    showBatchDownloadLinks(batch);
    await refreshRunLog();
  } catch (error) {
    writeStatus("Batch request failed", { error: error.message });
  } finally {
    runBatchButton.disabled = batchRows.length === 0;
  }
}

function validateRequest(payload) {
  if (!payload.clientUsername) return "Client username is required.";
  if (impersonatedClientUsername !== payload.clientUsername) return "Impersonate the client before submitting.";
  if (!payload.advertiserProgramIds.length) return "Load programs and select at least one advertiser program.";
  if (!payload.startDate || !payload.endDate) return "Select a valid reporting period.";
  if (payload.startDate > payload.endDate) return "Start date must be before end date.";
  if (daysBetween(payload.startDate, payload.endDate) > 366) return "Date ranges are limited to 366 days.";
  return "";
}

async function submitRequest() {
  clearResultLink();

  if (!form.reportValidity()) {
    writeStatus("Form validation failed", { message: "Complete required fields before submitting." });
    return;
  }

  const payload = getFormPayload();
  const validationError = validateRequest(payload);
  if (validationError) {
    writeStatus("Form validation failed", { error: validationError });
    return;
  }

  submitButton.disabled = true;

  try {
    await saveConnectionConfig();
    writeStatus("Submitting advertiser request...", payload);
    const response = await sendExtensionRequest({
      type: "SUBMIT_QBR_REQUEST",
      payload,
      bearerToken: accessTokenInput.value.trim()
    });
    writeStatus("Advertiser request response", response);

    const resultUrl = getResultUrl(response.data || response);
    if (resultUrl) {
      showResultLink("Open result", resolveResultUrl(resultUrl));
    }
    await refreshRunLog();
  } catch (error) {
    writeStatus("Advertiser request failed", { error: error.message });
  } finally {
    submitButton.disabled = false;
  }
}

async function init() {
  const storedConfig = await getStorageValue(STORAGE_KEYS.connectionConfig);
  applyConnectionConfig(storedConfig || DEFAULTS);
  renderPrograms();
  updateProgramStatus();
  updateSummary();
  refreshRunLog().catch((error) => writeStatus("Run log load failed", { error: error.message }));
}

form.addEventListener("input", updateSummary);
form.addEventListener("change", updateSummary);
for (const input of [adminUsernameInput, qbrWebhookUrlInput, backendApiUrlInput, oauthUrlInput, impersonateUrlInput, advertiserBaseInput, oauthBasicInput]) {
  input.addEventListener("blur", () => {
    saveConnectionConfig().catch((error) => writeStatus("Connection config save failed", { error: error.message }));
  });
}
testApiButton.addEventListener("click", testApi);
impersonateClientButton.addEventListener("click", impersonateClient);
loadProgramsButton.addEventListener("click", loadPrograms);
clearSessionButton.addEventListener("click", clearSessionFields);
programList.addEventListener("change", (event) => {
  if (!event.target.matches("input[type='checkbox'][name='programId']")) return;
  selectedProgramIds = Array.from(programList.querySelectorAll("input[type='checkbox'][name='programId']:checked"))
    .map((input) => input.value);
  renderPrograms();
  updateProgramStatus();
  updateSummary();
});
selectAllProgramsButton.addEventListener("click", () => {
  selectedProgramIds = programs.map((program) => program.id);
  renderPrograms();
  updateProgramStatus();
  updateSummary();
});
clearProgramsButton.addEventListener("click", () => {
  selectedProgramIds = [];
  renderPrograms();
  updateProgramStatus();
  updateSummary();
});
batchFileInput.addEventListener("change", handleBatchFileChange);
runBatchButton.addEventListener("click", runBatch);
refreshRunLogButton.addEventListener("click", refreshRunLog);
submitButton.addEventListener("click", submitRequest);

init();


