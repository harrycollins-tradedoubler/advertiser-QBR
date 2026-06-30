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

function loadBackground(fetchMock) {
  const context = {
    AbortController,
    URL,
    clearTimeout,
    crypto: { randomUUID: () => "test-thread-id" },
    fetch: fetchMock,
    globalThis: null,
    importScripts: () => {},
    setTimeout,
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
