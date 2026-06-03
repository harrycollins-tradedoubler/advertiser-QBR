const DEFAULT_API_BASE_URL = "http://localhost:3000";
const STORAGE_KEYS = {
  apiBaseUrl: "advertiserAgentApiBaseUrl"
};
const ROUTES = {
  health: "/api/health",
  submit: "/api/advertiser-agent",
  status: (executionId) => `/api/advertiser-agent/status/${encodeURIComponent(executionId)}`,
  download: (executionId) => `/api/advertiser-agent/download/${encodeURIComponent(executionId)}`,
  batch: "/api/advertiser-agent/batch",
  batchStatus: (batchId) => `/api/advertiser-agent/batch/${encodeURIComponent(batchId)}/status`,
  tdAdvertiserImpersonate: "/api/td/advertiser-impersonate",
  tdAdvertiserPrograms: (limit = 100) => `/api/td/advertiser-programs?limit=${encodeURIComponent(limit)}`,
  tdClearTokens: "/api/td/clear-tokens"
};
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 12;

const form = document.getElementById("advertiserForm");
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const testApiButton = document.getElementById("testApi");
const submitButton = document.getElementById("submitRequest");
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

let lastHealthCheck = {
  baseUrl: "",
  ok: false
};
let programs = [];
let selectedProgramIds = [];
let impersonatedClientUsername = "";
let batchRows = [];

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function joinUrl(baseUrl, path) {
  return `${normalizeApiBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
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

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

async function requestApiJson(path, options = {}) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL);
  await setStorageValue(STORAGE_KEYS.apiBaseUrl, baseUrl);

  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  let body = options.body;
  if (body && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const result = await sendRuntimeMessage({
    type: "ADVERTISER_AGENT_API_REQUEST",
    url: joinUrl(baseUrl, path),
    method: options.method || "GET",
    headers,
    body
  });

  if (!result || !result.ok) {
    throw new Error(result?.error || "The extension service worker did not return a response.");
  }

  return result.response;
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
  const rows = Array.isArray(batch?.rows) ? batch.rows : [];
  const successfulRows = rows.filter((row) => row.status === "success" && row.executionId);

  if (!successfulRows.length) return;

  for (const row of successfulRows) {
    const programLabel = Array.isArray(row.advertiserProgramIds) && row.advertiserProgramIds.length
      ? row.advertiserProgramIds.join(", ")
      : "unknown-program";
    appendResultLink(
      `Download row ${row.rowNumber} (${row.clientUsername} - ${programLabel})`,
      joinUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL, ROUTES.download(row.executionId))
    );
  }
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
    languageCode: data.get("languageCode"),
    currencyCode: data.get("currencyCode"),
    startDate: data.get("dateFrom"),
    endDate: data.get("dateTo"),
    fromDate: normalizeDate(data.get("dateFrom")),
    toDate: normalizeDate(data.get("dateTo")),
    tdSession: {
      mode: "backend_advertiser_impersonation",
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

function getExecutionId(data) {
  return findFirstValue(data, ["executionId", "jobId", "id"]);
}

function getResultUrl(data) {
  return findFirstValue(data, ["reportUrl", "downloadUrl", "download_url", "url"]);
}

function responseErrorMessage(response, fallback) {
  const rawData = typeof response?.data === "string" ? response.data : "";
  const routeNotFoundMatch = rawData.match(/Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+([^\s<]+)/i);
  if (routeNotFoundMatch) {
    return `${fallback}: API Base URL does not expose ${routeNotFoundMatch[1].toUpperCase()} ${routeNotFoundMatch[2]}`;
  }

  const detail = response?.data?.detail || response?.data?.message || rawData.trim() || response?.statusText;
  return detail ? `${fallback}: ${detail}` : fallback;
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
  return joinUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL, url);
}

function isTerminalStatus(data) {
  const status = String(findFirstValue(data, ["status", "state"]) || "").toLowerCase();
  return ["complete", "completed", "done", "failed", "error", "cancelled"].includes(status);
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

function getAuthHeaders() {
  const headers = {};
  const accessToken = accessTokenInput.value.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function testApi() {
  clearResultLink();
  const baseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL);
  apiBaseUrlInput.value = baseUrl;
  testApiButton.disabled = true;
  writeStatus("Testing API health endpoint...", { url: joinUrl(baseUrl, ROUTES.health) });

  try {
    const response = await requestApiJson(ROUTES.health);
    writeStatus("API health response", response);
    lastHealthCheck = {
      baseUrl,
      ok: Boolean(response.ok)
    };
    return lastHealthCheck.ok;
  } catch (error) {
    writeStatus("API health check failed", { error: error.message });
    lastHealthCheck = {
      baseUrl,
      ok: false
    };
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
    const response = await requestApiJson(ROUTES.tdAdvertiserImpersonate, {
      method: "POST",
      headers: getAuthHeaders(),
      body: {
        username: clientUsername
      }
    });
    if (!response.ok) {
      throw new Error(responseErrorMessage(response, `Client impersonation request returned HTTP ${response.status}`));
    }

    impersonatedClientUsername = clientUsername;
    programStatus.textContent = `Impersonated ${clientUsername}.`;
    updateSummary();
    writeStatus("Client impersonated via backend", {
      ok: response.ok,
      status: response.status,
      username: clientUsername,
      data: response.data,
      tokenStoredInExtension: false,
      tokenStoredServerSide: true
    });
    return true;
  } catch (error) {
    impersonatedClientUsername = "";
    updateSummary();
    programStatus.textContent = "Client impersonation failed.";
    writeStatus("Client impersonation failed", {
      error: error.message,
      hint: "Configure backend TD OAuth settings, or provide a temporary backend user token override."
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

    const response = await requestApiJson(ROUTES.tdAdvertiserPrograms(100));
    if (!response.ok) {
      throw new Error(responseErrorMessage(response, `Advertiser programs request returned HTTP ${response.status}`));
    }

    const items = normalizeProgramItems(response.data);
    programs = items
      .filter((item) => item?.active === true && item?.closedProgram !== true)
      .map((item) => ({
        id: String(item.id || ""),
        name: item.name ? String(item.name) : `Program ${item.id}`
      }))
      .filter((item) => item.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    selectedProgramIds = programs[0] ? [programs[0].id] : [];

    renderPrograms();
    updateProgramStatus();
    updateSummary();
    writeStatus("Advertiser programs loaded via backend impersonation", {
      ok: response.ok,
      status: response.status,
      activeOnly: response.data?.activeOnly === true,
      programCount: programs.length,
      selectedProgramIds,
      tdSession: {
        mode: "backend_advertiser_impersonation",
        clientUsername,
        tokenStoredInExtension: false
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
  clientUsernameInput.value = "";
  impersonatedClientUsername = "";
  programs = [];
  selectedProgramIds = [];
  renderPrograms();
  updateProgramStatus();
  updateSummary();

  try {
    await requestApiJson(ROUTES.tdClearTokens, { method: "POST" });
    writeStatus("TD session cleared", { extensionTokenFieldCleared: true, backendSessionClearRequested: true });
  } catch (error) {
    writeStatus("Extension fields cleared", {
      extensionTokenFieldCleared: true,
      backendSessionClearError: error.message
    });
  }
}

async function pollStatus(executionId) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const response = await requestApiJson(ROUTES.status(executionId));
    writeStatus(`Status poll ${attempt} of ${MAX_POLL_ATTEMPTS}`, response);

    const resultUrl = getResultUrl(response.data);
    if (resultUrl) {
      showResultLink("Open result", resolveResultUrl(resultUrl));
    }

    if (isTerminalStatus(response.data)) {
      if (!resultUrl && response.ok) {
        const downloadUrl = joinUrl(apiBaseUrlInput.value, ROUTES.download(executionId));
        showResultLink("Open download endpoint", downloadUrl);
      }
      return response;
    }
  }

  return null;
}

function isBatchTerminal(batch) {
  return ["completed", "completed_with_errors", "error"].includes(String(batch?.status || "").toLowerCase());
}

async function pollBatchStatus(batchId) {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await requestApiJson(ROUTES.batchStatus(batchId));
    writeStatus(`Batch status poll ${attempt}`, response);
    if (isBatchTerminal(response.data?.batch)) {
      showBatchDownloadLinks(response.data?.batch);
      return response;
    }
  }
  return null;
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

async function runBatch(event) {
  event?.preventDefault();
  event?.stopPropagation();
  clearResultLink();
  if (!batchRows.length) {
    writeStatus("Batch blocked", { error: "Upload a CSV or XLSX file first." });
    return;
  }

  runBatchButton.disabled = true;
  const currentBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL);
  apiBaseUrlInput.value = currentBaseUrl;

  try {
    if (lastHealthCheck.baseUrl !== currentBaseUrl || !lastHealthCheck.ok) {
      const apiIsHealthy = await testApi();
      if (!apiIsHealthy) {
        writeStatus("Batch blocked", {
          message: "Run Test API successfully before submitting the batch.",
          healthEndpoint: joinUrl(currentBaseUrl, ROUTES.health)
        });
        return;
      }
    }

    const response = await requestApiJson(ROUTES.batch, {
      method: "POST",
      body: {
        rows: batchRows
      }
    });
    writeStatus("Batch accepted", response);

    const batchId = response.data?.batchId;
    if (batchId) {
      await pollBatchStatus(batchId);
    }
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
  const currentBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL);
  apiBaseUrlInput.value = currentBaseUrl;

  try {
    if (lastHealthCheck.baseUrl !== currentBaseUrl || !lastHealthCheck.ok) {
      const apiIsHealthy = await testApi();
      if (!apiIsHealthy) {
        writeStatus("Advertiser request blocked", {
          message: "Run Test API successfully before submitting the workflow request.",
          healthEndpoint: joinUrl(currentBaseUrl, ROUTES.health)
        });
        return;
      }
    }

    writeStatus("Submitting advertiser request...", payload);
    const response = await requestApiJson(ROUTES.submit, {
      method: "POST",
      body: payload
    });
    writeStatus("Advertiser request response", response);

    const resultUrl = getResultUrl(response.data);
    if (resultUrl) {
      showResultLink("Open result", resolveResultUrl(resultUrl));
    }

    const executionId = getExecutionId(response.data);
    if (executionId && response.ok) {
      try {
        await pollStatus(executionId);
      } catch (error) {
        writeStatus("Status polling stopped", {
          executionId,
          error: error.message,
          statusEndpoint: ROUTES.status(executionId)
        });
      }
    }
  } catch (error) {
    writeStatus("Advertiser request failed", { error: error.message });
  } finally {
    submitButton.disabled = false;
  }
}

async function init() {
  const storedApiBaseUrl = await getStorageValue(STORAGE_KEYS.apiBaseUrl);
  apiBaseUrlInput.value = normalizeApiBaseUrl(storedApiBaseUrl || DEFAULT_API_BASE_URL);
  renderPrograms();
  updateProgramStatus();
  updateSummary();
}

form.addEventListener("input", updateSummary);
form.addEventListener("change", updateSummary);
apiBaseUrlInput.addEventListener("blur", async () => {
  const normalized = normalizeApiBaseUrl(apiBaseUrlInput.value || DEFAULT_API_BASE_URL);
  apiBaseUrlInput.value = normalized;
  await setStorageValue(STORAGE_KEYS.apiBaseUrl, normalized);
});
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
submitButton.addEventListener("click", submitRequest);

init();
