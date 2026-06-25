chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});

const DEFAULT_QBR_WEBHOOK_URL = "http://127.0.0.1:3021/webhook-local/advertiser-qbr";
const LEGACY_N8N_QBR_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/agency-agent-qbr-backend-auth-20260610";

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
  return /webhook/i.test(label) ? 180000 : 45000;
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

async function listAdvertiserPrograms(cfg, limit = 100) {
  if (!state.advertiserToken) throw new Error("No advertiser impersonation token available.");
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 100)));
  const data = await fetchJson(
    advertiserUrl(cfg, `programs?limit=${encodeURIComponent(safeLimit)}`),
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${state.advertiserToken}`
      }
    },
    "Advertiser programs"
  );

  return {
    items: extractArray(data),
    raw: data,
    td_tokens: currentTokens()
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
    if (runLogResponse?.duplicate) {
      const programIds = runLogResponse.programIds || requestPayload.advertiserProgramIds?.join(", ") || requestPayload.programId || "selected program";
      const dateRange = requestPayload.startDate && requestPayload.endDate
        ? `${requestPayload.startDate} to ${requestPayload.endDate}`
        : "the selected date range";
      throw new Error(`Duplicate QBR request blocked for ${programIds} (${dateRange}). Change the date range or selected programs to submit a new request.`);
    }
    runLogRecorded = Boolean(runLogResponse?.recorded);
  } catch (error) {
    runLogError = error && error.message ? error.message : String(error);
    if (/^Duplicate QBR request blocked/i.test(runLogError)) throw error;
  }

  const message = `QBR_REQUEST ${JSON.stringify(requestPayload)}`;
  const data = await fetchJson(
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

  return {
    ok: true,
    data,
    runLog: {
      recorded: runLogRecorded,
      error: runLogError
    },
    tdSession: {
      mode: "extension_advertiser_impersonation",
      clientUsername,
      tokenStoredInExtension: true
    }
  };
}

async function recordProgramRequestRun(cfg, payload) {
  return fetchJson(
    `${cfg.backendApiUrl}/program-request-runs`,
    {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payload })
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
    const data = await listAdvertiserPrograms(cfg, msg.limit);
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

