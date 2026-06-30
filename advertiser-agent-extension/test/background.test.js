const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function jsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload)
  };
}

function loadBackground(fetchMock, overrides = {}) {
  const context = {
    AbortController,
    URL,
    clearTimeout: overrides.clearTimeout || clearTimeout,
    crypto: { randomUUID: () => "test-thread-id" },
    fetch: fetchMock,
    globalThis: null,
    importScripts: () => {},
    setTimeout: overrides.setTimeout || setTimeout,
    chrome: {
      action: {
        onClicked: {
          addListener: () => {}
        }
      },
      runtime: {
        getURL: (value) => value,
        onMessage: {
          addListener: () => {}
        }
      },
      tabs: {
        create: () => {}
      }
    },
    AdvertiserBatchBuilder: {
      parseOrganizationIds: () => [],
      selectOwnerOrAdminUser: () => {
        throw new Error("not used");
      },
      normalizeProgramItems: () => []
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  vm.runInContext(source, context, { filename: "background.js" });
  return context;
}

test("lists advertiser programs across all TD pages", async () => {
  const requestedProgramUrls = [];
  const background = loadBackground(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/uaa/admin/impersonate")) {
      return jsonResponse({ access_token: "advertiser-token" });
    }
    if (requestUrl.includes("/advertiser/programs")) {
      requestedProgramUrls.push(requestUrl);
      const parsed = new URL(requestUrl);
      const offset = Number(parsed.searchParams.get("offset") || 0);
      const limit = Number(parsed.searchParams.get("limit") || 100);
      const pages = {
        0: [{ id: 46, active: true }, { id: 116, active: true }],
        2: [{ id: 120, active: true }]
      };
      return jsonResponse({
        offset,
        limit,
        total: 3,
        items: pages[offset] || []
      });
    }
    throw new Error(`Unexpected URL ${requestUrl}`);
  });

  await background.handleMessage({
    type: "IMPERSONATE_CLIENT",
    username: "cdon_owner",
    bearerToken: "admin-token"
  });

  const result = await background.handleMessage({
    type: "LIST_ADVERTISER_PROGRAMS",
    cfg: { advertiserBase: "https://connect.tradedoubler.com/advertiser/" }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.data.items, (item) => item.id), [46, 116, 120]);
  assert.deepEqual(
    requestedProgramUrls.map((requestUrl) => {
      const parsed = new URL(requestUrl);
      return Number(parsed.searchParams.get("offset") || 0);
    }),
    [0, 2]
  );
});
test("allows long-running QBR webhook generation before timing out", async () => {
  const timeoutDelays = [];
  const background = loadBackground(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/uaa/admin/impersonate")) {
      return jsonResponse({ access_token: "advertiser-token" });
    }
    if (requestUrl.includes("/program-request-runs")) {
      return jsonResponse({ recorded: true });
    }
    if (requestUrl === "http://127.0.0.1:3021/webhook-local/advertiser-qbr") {
      return jsonResponse({ success: true, pptx_url: "http://127.0.0.1:3011/files/test.pptx" });
    }
    throw new Error("Unexpected URL " + requestUrl);
  }, {
    setTimeout: (_callback, delay) => {
      timeoutDelays.push(delay);
      return { delay };
    },
    clearTimeout: () => {}
  });

  const result = await background.handleMessage({
    type: "SUBMIT_QBR_REQUEST",
    cfg: {
      backendApiUrl: "http://127.0.0.1:8008/api",
      qbrWebhookUrl: "http://127.0.0.1:3021/webhook-local/advertiser-qbr"
    },
    bearerToken: "admin-token",
    payload: {
      clientUsername: "client@example.com",
      advertiserProgramIds: ["298327"],
      startDate: "2026-04-01",
      endDate: "2026-06-30"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(Math.max(...timeoutDelays), 600000);
  assert(timeoutDelays.includes(45000));
});
test("submits QBR webhook even when run log marks request as duplicate", async () => {
  let runLogCalls = 0;
  let webhookCalls = 0;
  const background = loadBackground(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/uaa/admin/impersonate")) {
      return jsonResponse({ access_token: "advertiser-token" });
    }
    if (requestUrl.includes("/program-request-runs")) {
      runLogCalls += 1;
      return jsonResponse(runLogCalls === 1 ? { recorded: false, duplicate: true } : { recorded: false, updated: true });
    }
    if (requestUrl === "http://127.0.0.1:3021/webhook-local/advertiser-qbr") {
      webhookCalls += 1;
      return jsonResponse({ success: true, pptx_url: "http://127.0.0.1:3011/files/duplicate-test.pptx" });
    }
    throw new Error("Unexpected URL " + requestUrl);
  });

  const result = await background.handleMessage({
    type: "SUBMIT_QBR_REQUEST",
    cfg: {
      backendApiUrl: "http://127.0.0.1:8008/api",
      qbrWebhookUrl: "http://127.0.0.1:3021/webhook-local/advertiser-qbr"
    },
    bearerToken: "admin-token",
    payload: {
      clientUsername: "client@example.com",
      advertiserProgramIds: ["273525"],
      startDate: "2026-04-01",
      endDate: "2026-06-30"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(webhookCalls, 1);
});
