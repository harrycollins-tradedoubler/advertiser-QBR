chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});

importScripts("batch-builder.js");

const batchBuilder = globalThis.AdvertiserBatchBuilder;
const DEFAULT_QBR_WEBHOOK_URL = "http://127.0.0.1:3021/webhook-local/advertiser-qbr";
const LEGACY_N8N_QBR_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/agency-agent-qbr-backend-auth-20260610";
const PROGRAMS_PAGE_LIMIT = 100;
const DEFAULT_FETCH_TIMEOUT_MS = 45000;
const QBR_WEBHOOK_TIMEOUT_MS = 600000;

const state = {
  adminToken: null,
  advertiserToken: null,
  advertiserUser: null
};

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function normalizeBaseUrl(value, fallback) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function normalizeQbrWebhookUrl(value) {
  const normalized = normalizeBaseUrl(value, DEFAULT_QBR_WEBHOOK_URL);
  return normalized === LEGACY_N8N_QBR_WEBHOOK_URL ? DEFAULT_QBR_WEBHOOK_URL : normalized;
}

function normalizeCfg(cfg = {}) {
  return {
    adminUsername: String(cfg.adminUsername || cfg.username || "").trim(),
    adminPassword: String(cfg.adminPassword || cfg.password || ""),
    oauthUrl: String(cfg.oauthUrl || "https://connect.tradedoubler.com/uaa/oauth/token").trim(),
    impersonateUrl: String(cfg.impersonateUrl || "https://connect.tradedoubler.com/uaa/admin/impersonate?username=").trim(),
    advertiserBase: ensureTrailingSlash(String(cfg.advertiserBase || "https://connect.tradedoubler.com/advertiser/").trim()),
    userManagementBase: ensureTrailingSlash(String(cfg.userManagementBase || "https://connect.tradedoubler.com/usermanagement/").trim()),
    oauthBasic: String(cfg.oauthBasic || "dGRjb25uZWN0X3B1Ymxpc2hlcjoxMjM0NTY=").trim(),
    qbrWebhookUrl: normalizeQbrWebhookUrl(cfg.qbrWebhookUrl),
    backendApiUrl: normalizeBaseUrl(cfg.backendApiUrl, "http://127.0.0.1:8008/api")
  };
}

function toFormBody(values) {
  return Object.entries(values)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value == null ? "" : value)}`)
    .join("&");
}

function timeoutMsFor(label) {
  return /webhook/i.test(label) ? QBR_WEBHOOK_TIMEOUT_MS : DEFAULT_FETCH_TIMEOUT_MS;
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }

  if (!response.ok) {
    const detail = data && typeof data === "object"
      ? data.detail || data.message || data.error
      : String(data || "").slice(0, 1500);
    throw new Error(`${label} failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`);
  }

  return data;
}

async function fetchJson(url, init, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMsFor(label));

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await readJsonResponse(response, label);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`${label} timed out while calling ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function oauthPasswordToken(cfg) {
  if (!cfg.adminUsername || !cfg.adminPassword) {
    throw new Error("Admin username/password are required unless an admin bearer token override is provided.");
  }
  if (!cfg.oauthUrl || !cfg.oauthBasic) {
    throw new Error("OAuth URL and OAuth Basic are required.");
  }

  const data = await fetchJson(
    cfg.oauthUrl,
    {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Basic ${cfg.oauthBasic.replace(/^Basic\s+/i, "")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: toFormBody({
        grant_type: "password",
        username: cfg.adminUsername,
        password: cfg.adminPassword
      })
    },
    "OAuth token"
  );

  const token = data && data.access_token;
  if (!token) throw new Error("No access_token in OAuth response.");
  return String(token);
}

async function ensureAdminToken(cfg, bearerToken) {
  const override = String(bearerToken || "").trim();
  if (override) {
    state.adminToken = override;
    return state.adminToken;
  }

  if (state.adminToken) return state.adminToken;
  state.adminToken = await oauthPasswordToken(cfg);
  return state.adminToken;
}

async function impersonate(cfg, username, bearerToken) {
  const targetUser = String(username || "").trim();
  if (!targetUser) throw new Error("Client username is required.");

  const adminToken = await ensureAdminToken(cfg, bearerToken);
  const data = await fetchJson(
    `${cfg.impersonateUrl}${encodeURIComponent(targetUser)}`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${adminToken}`
      }
    },
    "Client impersonation"
  );

  const token = data && data.access_token;
  if (!token) throw new Error("No access_token in impersonation response.");

  state.advertiserUser = targetUser;
  state.advertiserToken = String(token);
  return {
    username: targetUser,
    tokenStoredInExtension: true
  };
}

function advertiserUrl(cfg, path) {
  return `${cfg.advertiserBase}${trimSlashes(path)}`;
}

function urlWithQueryParams(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) return payload.items;
  for (const key of ["programs", "results", "data", "content", "list"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.items)) return value.items;
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function paginationValue(payload, key) {
  const value = payload && typeof payload === "object"
    ? payload[key] ?? payload.data?.[key]
    : undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function listAdvertiserPrograms(cfg) {
  if (!state.advertiserToken) throw new Error("No advertiser impersonation token available.");
  const baseUrl = advertiserUrl(cfg, "programs");
  const items = [];
  const pages = [];
  let offset = 0;

  while (true) {
    const data = await fetchJson(
      urlWithQueryParams(baseUrl, { offset, limit: PROGRAMS_PAGE_LIMIT }),
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${state.advertiserToken}`
        }
      },
      "Advertiser programs"
    );
    const pageItems = extractArray(data);
    const responseOffset = paginationValue(data, "offset") ?? offset;
    const responseLimit = paginationValue(data, "limit") ?? PROGRAMS_PAGE_LIMIT;
    const responseTotal = paginationValue(data, "total");

    items.push(...pageItems);
    pages.push({ offset: responseOffset, limit: responseLimit, count: pageItems.length });

    const nextOffset = responseOffset + pageItems.length;
    const reachedTotal = responseTotal == null || nextOffset >= responseTotal;
    const emptyPage = pageItems.length === 0;
    const noProgress = nextOffset <= offset;
    if (reachedTotal || emptyPage || noProgress) break;

    offset = nextOffset;
  }

  return {
    items,
    raw: {
      pages,
      total: items.length
    },
    td_tokens: currentTokens()
  };
}

function userManagementUrl(cfg, path) {
  return `${cfg.userManagementBase}${trimSlashes(path)}`;
}

async function fetchOrganizationUsers(cfg, organizationId, bearerToken) {
  const adminToken = await ensureAdminToken(cfg, bearerToken);
  return fetchJson(
    `${userManagementUrl(cfg, "internal/users")}?organizationId=${encodeURIComponent(organizationId)}&deleted=false&limit=100`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${adminToken}`
      }
    },
    `Organisation ${organizationId} users`
  );
}

async function resolveOrganizationBatch(cfg, rawOrganizationIds, bearerToken) {
  const organizationIds = batchBuilder.parseOrganizationIds(rawOrganizationIds);
  if (!organizationIds.length) throw new Error("Enter at least one organisation ID.");

  const items = [];
  for (const organizationId of organizationIds) {
    try {
      const usersData = await fetchOrganizationUsers(cfg, organizationId, bearerToken);
      const user = batchBuilder.selectOwnerOrAdminUser(usersData);
      await impersonate(cfg, user.username, bearerToken);
      const programsData = await listAdvertiserPrograms(cfg);
      const programs = batchBuilder.normalizeProgramItems(programsData);
      items.push({
        organizationId,
        clientUsername: user.username,
        roleId: user.roleId,
        programs,
        selectedProgramIds: programs.map((program) => program.id)
      });
    } catch (error) {
      items.push({
        organizationId,
        error: error && error.message ? error.message : String(error),
        programs: [],
        selectedProgramIds: []
      });
    }
  }

  return {
    items,
    resolvedCount: items.filter((item) => !item.error).length,
    errorCount: items.filter((item) => item.error).length
  };
}
function currentTokens() {
  if (!state.adminToken || !state.advertiserToken) return null;
  return {
    user_access_token: state.adminToken,
    impersonate_access_token: state.advertiserToken
  };
}

async function submitQbrRequest(cfg, payload, bearerToken) {
  const clientUsername = String(payload && payload.clientUsername || "").trim();
  if (!clientUsername) throw new Error("clientUsername is required.");
  if (state.advertiserUser !== clientUsername || !state.advertiserToken) {
    await impersonate(cfg, clientUsername, bearerToken);
  }

  const tokens = currentTokens();
  if (!tokens) throw new Error("No TD tokens available for QBR request.");

  const requestPayload = {
    ...payload,
    tdSession: {
      ...(payload.tdSession || {}),
      mode: "extension_advertiser_impersonation",
      tokensIncluded: false
    }
  };
  let runLogRecorded = false;
  let runLogError = "";
  try {
    const runLogResponse = await recordProgramRequestRun(cfg, requestPayload);
    runLogRecorded = Boolean(runLogResponse?.recorded || runLogResponse?.duplicate);
  } catch (error) {
    runLogError = error && error.message ? error.message : String(error);
  }

  const message = `QBR_REQUEST ${JSON.stringify(requestPayload)}`;
  const buildStartedAt = Date.now();
  let buildDurationMs = null;
  let data;

  try {
    data = await fetchJson(
      cfg.qbrWebhookUrl,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          thread_id: crypto.randomUUID(),
          payload: requestPayload,
          qbr_payload: requestPayload,
          td_tokens: tokens
        })
      },
      "QBR webhook"
    );
    buildDurationMs = Math.max(0, Date.now() - buildStartedAt);
  } catch (error) {
    buildDurationMs = Math.max(0, Date.now() - buildStartedAt);
    try {
      await recordProgramRequestRun(cfg, requestPayload, { buildDurationMs });
    } catch (logError) {
      runLogError = logError && logError.message ? logError.message : String(logError);
    }
    throw error;
  }

  try {
    const runLogResponse = await recordProgramRequestRun(cfg, requestPayload, { buildDurationMs });
    runLogRecorded = runLogRecorded || Boolean(runLogResponse?.recorded || runLogResponse?.updated);
  } catch (error) {
    runLogError = error && error.message ? error.message : String(error);
  }

  return {
    ok: true,
    data,
    runLog: {
      recorded: runLogRecorded,
      error: runLogError,
      buildDurationMs
    },
    tdSession: {
      mode: "extension_advertiser_impersonation",
      clientUsername,
      tokenStoredInExtension: true
    }
  };
}

async function recordProgramRequestRun(cfg, payload, options = {}) {
  const body = { payload };
  const buildDurationMs = Number(options.buildDurationMs);
  if (Number.isFinite(buildDurationMs) && buildDurationMs >= 0) {
    body.buildDurationMs = Math.round(buildDurationMs);
  }

  return fetchJson(
    `${cfg.backendApiUrl}/program-request-runs`,
    {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    "Program request run logging"
  );
}

async function listProgramRequestRuns(cfg, limit = 50) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 50)));
  return fetchJson(
    `${cfg.backendApiUrl}/program-request-runs?limit=${encodeURIComponent(safeLimit)}`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    },
    "Program request run log"
  );
}

async function handleMessage(msg) {
  if (!msg || !msg.type) {
    return { ok: false, error: "Missing message type." };
  }

  if (msg.type === "CLEAR_STATE") {
    state.adminToken = null;
    state.advertiserToken = null;
    state.advertiserUser = null;
    return { ok: true, data: { status: "cleared" } };
  }

  const cfg = normalizeCfg(msg.cfg || {});
  const bearerToken = String(msg.bearerToken || "").trim();

  if (msg.type === "SAVE_CONFIG") {
    return { ok: true, data: { status: "saved", qbrWebhookUrl: cfg.qbrWebhookUrl } };
  }

  if (msg.type === "IMPERSONATE_CLIENT") {
    const data = await impersonate(cfg, msg.username, bearerToken);
    return { ok: true, data };
  }

  if (msg.type === "LIST_ADVERTISER_PROGRAMS") {
    const data = await listAdvertiserPrograms(cfg);
    return { ok: true, data };
  }

  if (msg.type === "RESOLVE_ORGANIZATION_BATCH") {
    const data = await resolveOrganizationBatch(cfg, msg.organizationIds || [], bearerToken);
    return { ok: true, data };
  }

  if (msg.type === "SUBMIT_QBR_REQUEST") {
    const data = await submitQbrRequest(cfg, msg.payload, bearerToken);
    return { ok: true, data };
  }

  if (msg.type === "LIST_PROGRAM_REQUEST_RUNS") {
    const data = await listProgramRequestRuns(cfg, msg.limit);
    return { ok: true, data };
  }

  return { ok: false, error: `Unknown message type: ${msg.type}` };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    });

  return true;
});

