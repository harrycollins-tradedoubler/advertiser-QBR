const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createServer, isDockerBridgeAddress, isLocalhostAddress, isLocalRequest } = require("../server");
const {
  normalizeIncomingRequest,
  normalizeQbrPayload,
  createAdvertiserQbrRunner,
  redactSensitive,
  validatePptxPayload,
  processProgramData
} = require("../lib/advertiserQbrRunner");
const {
  createAdvertiserQbrAgent,
  validateAgentJson,
  runAllowlistedTool
} = require("../lib/advertiserQbrAgent");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function mockJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
  };
}

function sampleRequest() {
  const payload = {
    type: "ADVERTISER_AGENT_REQUEST",
    analysisLevel: "program",
    clientUsername: "client@example.com",
    programId: "111",
    programName: "Example Advertiser",
    publisherProgramIds: ["111"],
    analysisProgramIds: ["111"],
    languageCode: "EN",
    currencyCode: "GBP",
    startDate: "2026-01-01",
    endDate: "2026-03-31"
  };
  return {
    message: `QBR_REQUEST ${JSON.stringify(payload)}`,
    thread_id: "thread-1",
    payload,
    qbr_payload: payload,
    td_tokens: {
      user_access_token: "admin-token",
      impersonate_access_token: "advertiser-token"
    }
  };
}

test("normalizes extension and n8n-compatible request bodies", () => {
  const request = sampleRequest();
  const normalized = normalizeIncomingRequest({
    message: request.message,
    td_tokens: request.td_tokens
  });
  assert.equal(normalized.payload.programId, "111");
  assert.equal(normalized.tdTokens.impersonate_access_token, "advertiser-token");
});

test("normalizes dates, language, currency, prior year dates, and selected program scope", () => {
  const { payload, prev } = normalizeQbrPayload({
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    currencyCode: "gbp",
    languageCode: "en",
    programId: "111",
    publisherProgramIds: "111,222",
    advertiserProgramIds: ["333"],
    programIds: ["444"],
    analysisProgramIds: ["555"],
    organizationId: "999"
  });
  assert.equal(payload.fromDate, "20260101");
  assert.equal(payload.toDate, "20260331");
  assert.equal(prev.fromDate, "20250101");
  assert.equal(prev.toDate, "20250331");
  assert.equal(payload.currencyCode, "GBP");
  assert.equal(payload.languageName, "English");
  assert.deepEqual(payload.publisherProgramIds, ["111", "222", "333", "444", "555"]);
  assert.equal(payload.statsScopeQuery, "&organizationId=999");
});

test("program scope table uses selected program countryCode as the market fallback", () => {
  const program = processProgramData(
    [
      {
        programId: "246003",
        programName: "Radisson Blu",
        clicks: 100,
        impressions: 1000,
        sales: 10,
        orderValue: 2500,
        commission: { publisherCommission: 50, totalCommission: 75 }
      }
    ],
    [
      {
        programId: "246003",
        programName: "Radisson Blu",
        clicks: 80,
        impressions: 900,
        sales: 8,
        orderValue: 2000,
        commission: { publisherCommission: 40, totalCommission: 60 }
      }
    ],
    {
      analysisLevel: "program",
      programId: "246003",
      publisherProgramIds: ["246003"],
      analysisProgramIds: ["246003"],
      advertiserPrograms: [
        {
          id: 246003,
          name: "Radisson Blu",
          countryCode: "GB"
        }
      ],
      currencyCode: "GBP",
      reportingPeriod: "2026-01-01 to 2026-03-31",
      comparisonPeriod: "2025-01-01 to 2025-03-31"
    }
  );

  assert.equal(program.programScopeTable[0]["Program ID"], "246003");
  assert.equal(program.programScopeTable[0].Market, "GB");
});

test("route accepts local webhook requests and returns the n8n-compatible projection", async () => {
  const debugDir = await fs.mkdtemp(path.join(os.tmpdir(), "advertiser-qbr-debug-"));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/advertiser/report/statistics?")) {
      assert.equal(init.headers.Authorization, "Bearer advertiser-token");
      assert.match(String(url), /limit=100/);
      assert.match(String(url), /offset=0/);
      assert.match(String(url), /reportCurrencyCode=GBP/);
      return mockJsonResponse({
        total: 2,
        items: [
          { programId: "111", programName: "Example Advertiser", clicks: 100, sales: 10, orderValue: 1000, commission: { publisherCommission: 50, totalCommission: 70 } },
          { programId: "111", programName: "Example Advertiser", clicks: 200, sales: 20, orderValue: 2000, commission: { publisherCommission: 100, totalCommission: 140 } }
        ]
      });
    }
    if (String(url).includes("/events/sources/export")) {
      return mockJsonResponse({
        items: [
          { sourceId: "s1", sourceName: "Top Publisher", clicks: 20, sales: 5, orderValue: 500, commission: { publisherCommission: 25 } }
        ]
      });
    }
    if (String(url).includes("/statistics/categories")) {
      return mockJsonResponse({ items: [{ publisherCategoryName: "Voucher", orderValue: 500, sales: 5 }] });
    }
    if (String(url).includes("/advertiser/sources")) {
      return mockJsonResponse({ total: 1, items: [{ id: "src-1", name: "Prospect Publisher", promotionTypeName: "Voucher", acceptedConnections: 12, acceptanceRatio: 0.8, description: "Voucher and discount publisher" }] });
    }
    if (String(url) === "http://127.0.0.1:3011/generate") {
      assert.equal(init.headers["x-api-key"], "td-qbr-pptx-local-2026-secret");
      const body = JSON.parse(init.body);
      assert.equal(body.client, "Example Advertiser");
      assert.equal(body.programYoYTable.length, 4);
      assert.equal(body.publisherTables.top10ByOV.length, 1);
      assert.equal(body.publisherTables.topPublisherPerformance.length, 1);
      assert.equal(body.slideBlueprint[0].key, "cover");
      assert.deepEqual(body.slideTableBindings.movers_sales, ["moversShakersSales"]);
      return mockJsonResponse({
        success: true,
        provider: "qbr-pptx",
        message: "Editable QBR PowerPoint generated successfully.",
        presentation_id: "deck-1",
        pptx_url: "http://127.0.0.1:3011/files/deck.pptx",
        bundle_url: "http://127.0.0.1:3011/files/deck_bundle.zip",
        presenter_notes_url: "http://127.0.0.1:3011/files/presenter-notes.docx",
        publisher_performance_excel_url: "http://127.0.0.1:3011/files/publisher-performance.xlsx",
        publisher_performance_excel_file_name: "publisher-performance.xlsx",
        file_name: "deck.pptx",
        theme: "TD",
        slide_count: 18
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const runner = createAdvertiserQbrRunner({
    fetchImpl,
    debugDir,
    agentMode: "deterministic",
    now: () => Date.UTC(2026, 0, 1, 12, 0, 0)
  });
  const server = createServer({ runner });
  const root = await listen(server);
  try {
    const response = await fetch(`${root}/webhook-local/advertiser-qbr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleRequest())
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pptx_url, "http://127.0.0.1:3011/files/deck.pptx");
    assert.equal(body.qbr_bundle_url, "http://127.0.0.1:3011/files/deck_bundle.zip");
    assert.equal(body.presenter_notes_url, "http://127.0.0.1:3011/files/presenter-notes.docx");
    assert.equal(body.gap_analysis_report_url, null);
    assert.equal(body.publisher_program_performance_excel_url, "http://127.0.0.1:3011/files/publisher-performance.xlsx");
    assert.deepEqual(Object.keys(body).sort(), [
      "gap_analysis_report_url",
      "pptx_url",
      "presenter_notes_url",
      "publisher_program_performance_excel_url",
      "qbr_bundle_url"
    ].sort());

    const debugFiles = await fs.readdir(debugDir);
    assert.equal(debugFiles.length, 1);
    const debugPayload = JSON.parse(await fs.readFile(path.join(debugDir, debugFiles[0]), "utf8"));
    assert.equal(debugPayload.normalizedInput.tdTokens.impersonate_access_token, "[redacted]");
    assert.equal(debugPayload.fetchedRowCounts.currentProgramRows, 2);
    assert.equal(debugPayload.tableRowCounts.programYoYTable, 4);
    assert.equal(debugPayload.finalPptxPayload.publisherTables.top10ByOV.length, 1);

    assert(calls.some((call) => /fromDate=20260101/.test(call.url)));
    assert(calls.some((call) => /fromDate=20250101/.test(call.url)));
  } finally {
    await close(server);
    await fs.rm(debugDir, { recursive: true, force: true });
  }
});

test("publisher narrative stays deterministic when program agent uses OpenAI", async () => {
  let openAiCalls = 0;
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target === "https://api.openai.com/v1/responses") {
      openAiCalls += 1;
      return mockJsonResponse({
        output_text: JSON.stringify({
          output: "## Program Performance (YoY)\n- Program performance generated by model.",
          insights: ["Program model insight"]
        })
      });
    }
    if (target === "http://127.0.0.1:3011/generate") {
      return mockJsonResponse({
        success: true,
        pptx_url: "http://127.0.0.1:3011/files/deck.pptx",
        bundle_url: "http://127.0.0.1:3011/files/deck_bundle.zip",
        publisher_recommendations_excel_url: "http://127.0.0.1:3011/files/recommendations.xlsx",
        publisher_performance_excel_url: "http://127.0.0.1:3011/files/performance.xlsx"
      });
    }
    return mockJsonResponse({ total: 0, items: [] });
  };

  const runner = createAdvertiserQbrRunner({
    fetchImpl,
    agentMode: "model",
    openaiApiKey: "test-key"
  });

  const result = await runner.run(sampleRequest());
  assert.equal(result.pptx_url, "http://127.0.0.1:3011/files/deck.pptx");
  assert.equal(result.qbr_bundle_url, "http://127.0.0.1:3011/files/deck_bundle.zip");
  assert.equal(openAiCalls, 1);
});

test("route rejects non-localhost requests through the access helper", () => {
  assert.equal(isLocalhostAddress("127.0.0.1"), true);
  assert.equal(isLocalhostAddress("::1"), true);
  assert.equal(isLocalhostAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLocalhostAddress("10.0.0.8"), false);
});

test("access helper allows Docker bridge requests only when explicitly enabled", () => {
  const dockerBridgeRequest = { socket: { remoteAddress: "172.18.0.1" }, headers: {} };
  const externalRequest = { socket: { remoteAddress: "10.0.0.8" }, headers: {} };

  assert.equal(isDockerBridgeAddress("172.18.0.1"), true);
  assert.equal(isDockerBridgeAddress("::ffff:172.18.0.1"), true);
  assert.equal(isDockerBridgeAddress("10.0.0.8"), false);
  assert.equal(isLocalRequest(dockerBridgeRequest), false);
  assert.equal(isLocalRequest(dockerBridgeRequest, { allowDockerBridge: true }), true);
  assert.equal(isLocalRequest(externalRequest, { allowDockerBridge: true }), false);
});

test("maps PPTX service failures to explicit n8n-compatible errors", async () => {
  const runner = createAdvertiserQbrRunner({
    agentMode: "deterministic",
    fetchImpl: async (url) => {
      if (String(url).includes("/generate")) return mockJsonResponse({ success: false, error: "renderer failed" }, 500);
      return mockJsonResponse({ total: 0, items: [] });
    }
  });
  const result = await runner.run(sampleRequest());
  assert.equal(result.success, false);
  assert.equal(result.generation_status, "failed");
  assert.match(result.error, /renderer failed|HTTP 500/);
});

test("optional source metadata failures do not abort multi-program requests", async () => {
  const seenUrls = [];
  const runner = createAdvertiserQbrRunner({
    agentMode: "deterministic",
    fetchImpl: async (url, init = {}) => {
      seenUrls.push(String(url));
      if (String(url).includes("/advertiser/sources") && String(url).includes("programId=222")) {
        return mockJsonResponse({ message: "temporary source metadata failure" }, 500);
      }
      if (String(url).includes("/generate")) {
        return mockJsonResponse({
          success: true,
          pptx_url: "http://127.0.0.1:3011/files/deck.pptx",
          bundle_url: "http://127.0.0.1:3011/files/deck_bundle.zip",
          publisher_recommendations_excel_url: "http://127.0.0.1:3011/files/recommendations.xlsx",
          publisher_performance_excel_url: "http://127.0.0.1:3011/files/performance.xlsx"
        });
      }
      return mockJsonResponse({ total: 0, items: [] });
    }
  });
  const request = sampleRequest();
  request.payload.publisherProgramIds = ["111", "222"];
  request.payload.advertiserProgramIds = ["111", "222"];
  request.qbr_payload = request.payload;
  request.message = `QBR_REQUEST ${JSON.stringify(request.payload)}`;

  const result = await runner.run(request);
  assert.equal(result.pptx_url, "http://127.0.0.1:3011/files/deck.pptx");
  assert.equal(result.qbr_bundle_url, "http://127.0.0.1:3011/files/deck_bundle.zip");
  assert.equal(result.gap_analysis_report_url, "http://127.0.0.1:3011/files/recommendations.xlsx");
  assert.equal(result.publisher_program_performance_excel_url, "http://127.0.0.1:3011/files/performance.xlsx");
  assert(seenUrls.some((url) => url.includes("programId=222")));
});

test("validates final PPTX payload before generation", () => {
  assert.throws(
    () => validatePptxPayload({ client: "Client", slideBlueprint: [], programYoYTable: [] }),
    /publisherTables/
  );
});

test("agent supports deterministic fallback, JSON validation, max iterations, tools, and redacted logs", async () => {
  const fallback = createAdvertiserQbrAgent({ mode: "deterministic" });
  const fallbackResult = await fallback.run({
    kind: "program",
    dataForAI: "Program YoY Summary Table",
    payload: { languageName: "English" }
  });
  assert.match(fallbackResult.output, /Program Performance/);

  assert.deepEqual(validateAgentJson('{"output":"ok","insights":["a"]}'), { output: "ok", insights: ["a"] });
  assert.throws(() => validateAgentJson("{broken"), /malformed JSON/);
  assert.throws(() => validateAgentJson('{"insights":[]}'), /output/);

  const maxed = createAdvertiserQbrAgent({
    mode: "model",
    apiKey: "key",
    maxIterations: 1,
    fetchImpl: async () => mockJsonResponse({
      tool_call: { name: "summarize_table", input: { rows: [{ a: 1 }] } }
    })
  });
  await assert.rejects(() => maxed.run({ kind: "program", dataForAI: "x", payload: {} }), /maxIterations/);

  assert.deepEqual(
    runAllowlistedTool("summarize_table", { rows: [{ a: 1 }, { a: 2 }] }),
    { rowCount: 2, columns: ["a"] }
  );
  assert.throws(() => runAllowlistedTool("summarize_table", { rows: "bad" }), /rows/);
  assert.throws(() => runAllowlistedTool("unsafe", {}), /not allowlisted/);
});

test("redacts sensitive values recursively", () => {
  const redacted = redactSensitive({
    Authorization: "Bearer abc",
    cookie: "sid=1",
    nested: {
      password: "pw",
      client_secret: "secret",
      safe: "visible"
    }
  });
  assert.equal(redacted.Authorization, "[redacted]");
  assert.equal(redacted.cookie, "[redacted]");
  assert.equal(redacted.nested.password, "[redacted]");
  assert.equal(redacted.nested.client_secret, "[redacted]");
  assert.equal(redacted.nested.safe, "visible");
});

test("publisher pack preserves segment categories, site ids, by-program rows, and source ratios", () => {
  const { processPublisherPack } = require("../lib/advertiserQbrRunner");
  const payload = {
    currencyCode: "EUR",
    reportingPeriod: "2026-01-01 to 2026-06-22",
    comparisonPeriod: "2025-01-01 to 2025-06-22"
  };
  const currentRows = [
    { programId: "246020", programName: "246020", sourceId: "2521731", sourceName: "www.trumf.no", clicks: 100, sales: 20, salesOrderValue: 2000, salesCommission: { publisherCommission: 100 } },
    { programId: "246024", programName: "246024", sourceId: "1819374", sourceName: "shoop.de", clicks: 80, sales: 10, salesOrderValue: 1000, salesCommission: { publisherCommission: 50 } }
  ];
  const previousRows = [
    { programId: "246020", sourceId: "2521731", sourceName: "www.trumf.no", clicks: 50, sales: 10, salesOrderValue: 1000, salesCommission: { publisherCommission: 50 } },
    { programId: "246024", sourceId: "1819374", sourceName: "shoop.de", clicks: 40, sales: 5, salesOrderValue: 500, salesCommission: { publisherCommission: 25 } }
  ];
  const categoryCurrentRows = [
    { publisherCategoryName: "Cashback & Loyalty sites", sales: 30, salesOrderValue: 3000 }
  ];
  const categoryPreviousRows = [
    { publisherCategoryName: "Cashback & Loyalty sites", sales: 15, salesOrderValue: 1500 }
  ];
  const sourceRows = [
    { programId: "246020", sourceId: "s1", sourceName: "Prospect", promotionTypeName: "Content", acceptedConnections: 10, rejectedConnections: 2, totalConnections: 12, acceptanceRatio: 84.4 }
  ];
  const pack = processPublisherPack(currentRows, previousRows, categoryCurrentRows, categoryPreviousRows, sourceRows, payload);

  assert.equal(pack.publisherTables.segmentSummary[0].Segment, "Cashback & Loyalty sites");
  assert.equal(pack.publisherTables.topPublisherPerformance[0]["Site ID"], "2521731");
  assert.equal(pack.publisherTables.publisherPerformanceByProgram.length, 2);
  assert.equal(pack.publisherTables.publisherPerformanceByProgram[0]["Program ID"], "246020");
  assert.equal(pack.publisherCategorySlides[0].recommendedPublishers[0]["Acceptance Ratio"], "84.4%");
});

test("publisher recommendations preserve all submitted program ids and brand-new ranking labels omit N/A", () => {
  const { processPublisherPack } = require("../lib/advertiserQbrRunner");
  const payload = {
    currencyCode: "EUR",
    reportingPeriod: "2026-01-01 to 2026-06-22",
    comparisonPeriod: "2025-01-01 to 2025-06-22"
  };
  const currentRows = [];
  const sourceRows = [];
  for (let index = 1; index <= 20; index += 1) {
    const programId = `2460${String(index).padStart(2, "0")}`;
    currentRows.push({
      programId,
      sourceId: `brand-${index}`,
      sourceName: `Brand New ${index}`,
      clicks: 10,
      sales: 2,
      salesOrderValue: 1000 + index
    });
    sourceRows.push({
      programId,
      sourceId: `src-${index}`,
      sourceName: `Prospect ${index}`,
      promotionTypeName: "Content",
      totalConnections: 100 + index,
      acceptedConnections: 80 + index,
      rejectedConnections: 20,
      acceptanceRatio: 84.4
    });
  }

  const pack = processPublisherPack(currentRows, [], [], [], sourceRows, payload);
  const recommendationProgramIds = new Set(pack.publisherCategorySlides.map((slide) => slide.programId));
  assert.equal(recommendationProgramIds.size, 20);
  assert.equal(pack.publisherCategorySlides.length, 20);
  assert.equal(pack.brandNewPublisherRanking.top[0].label.includes("N/A"), false);
  assert.equal(typeof pack.brandNewPublisherRanking.top[0].value, "number");
});

test("publisher recommendation category slides retain total publisher counts beyond top 10", () => {
  const { processPublisherPack } = require("../lib/advertiserQbrRunner");
  const payload = {
    currencyCode: "EUR",
    reportingPeriod: "2026-01-01 to 2026-06-22",
    comparisonPeriod: "2025-01-01 to 2025-06-22"
  };
  const sourceRows = Array.from({ length: 12 }, (_, index) => ({
    programId: "246020",
    sourceId: `src-${index + 1}`,
    sourceName: `Content Prospect ${index + 1}`,
    promotionTypeName: "Content",
    totalConnections: 100 - index,
    acceptedConnections: 50 - index,
    rejectedConnections: index,
    acceptanceRatio: 90 - index
  }));

  const pack = processPublisherPack([], [], [], [], sourceRows, payload);

  assert.equal(pack.publisherCategorySlides[0].category, "Content");
  assert.equal(pack.publisherCategorySlides[0].publisherCount, 12);
  assert.equal(pack.publisherCategorySlides[0].recommendedPublishers.length, 10);
});

test("publisher source metadata uses per publisher-type totals instead of fetched row caps", async () => {
  let generatorPayload = null;
  const contentRows = Array.from({ length: 30 }, (_, index) => ({
    id: `content-${index + 1}`,
    name: `Content Prospect ${index + 1}`,
    promotionTypeId: 4,
    promotionTypeName: "Content",
    acceptedConnections: 60 - index,
    rejectedConnections: index,
    totalConnections: 60,
    acceptanceRatio: 80 - index / 10
  }));
  const cashbackRows = Array.from({ length: 2 }, (_, index) => ({
    id: `cashback-${index + 1}`,
    name: `Cashback Prospect ${index + 1}`,
    promotionTypeId: 2,
    promotionTypeName: "Cashback & Loyalty sites",
    acceptedConnections: 20 - index,
    rejectedConnections: index,
    totalConnections: 20,
    acceptanceRatio: 70 - index
  }));

  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    if (String(url) === "http://127.0.0.1:3011/generate") {
      generatorPayload = JSON.parse(init.body);
      return mockJsonResponse({ success: true, pptx_url: "http://127.0.0.1:3011/files/deck.pptx" });
    }
    if (target.pathname.endsWith("/advertiser/sources")) {
      const promotionTypeId = target.searchParams.get("promotionTypeId");
      if (promotionTypeId === "4") return mockJsonResponse({ total: 123, items: [contentRows[0]] });
      if (promotionTypeId === "2") return mockJsonResponse({ total: 2, items: [cashbackRows[0]] });
      return mockJsonResponse({ total: 32, items: [...contentRows, ...cashbackRows] });
    }
    return mockJsonResponse({ total: 0, items: [] });
  };

  const runner = createAdvertiserQbrRunner({ fetchImpl, agentMode: "deterministic" });
  const result = await runner.run(sampleRequest());

  assert.equal(result.pptx_url, "http://127.0.0.1:3011/files/deck.pptx");
  const contentSlide = generatorPayload.publisherCategorySlides.find((slide) => slide.category === "Content");
  const cashbackSlide = generatorPayload.publisherCategorySlides.find((slide) => slide.category === "Cashback & Loyalty sites");
  assert.equal(contentSlide.publisherCount, 123);
  assert.equal(contentSlide.totalPublishers, 123);
  assert.equal(contentSlide.recommendedPublishers.length, 10);
  assert.equal(cashbackSlide.publisherCount, 2);
});

test("publisher movers keep top 10 up and top 10 down for each movement metric", () => {
  const { processPublisherPack } = require("../lib/advertiserQbrRunner");
  const payload = {
    currencyCode: "EUR",
    reportingPeriod: "2026-01-01 to 2026-06-22",
    comparisonPeriod: "2025-01-01 to 2025-06-22"
  };
  const currentRows = [];
  const previousRows = [];
  for (let index = 1; index <= 12; index += 1) {
    currentRows.push({
      programId: "246020",
      sourceId: `up-${index}`,
      sourceName: `Growth ${index}`,
      clicks: 1000 + index,
      sales: 100 + index,
      salesOrderValue: 10000 + index * 100,
      salesCommission: { publisherCommission: 100 }
    });
    previousRows.push({
      programId: "246020",
      sourceId: `up-${index}`,
      sourceName: `Growth ${index}`,
      clicks: 100,
      sales: 10,
      salesOrderValue: 1000,
      salesCommission: { publisherCommission: 50 }
    });
    currentRows.push({
      programId: "246020",
      sourceId: `down-${index}`,
      sourceName: `Decline ${index}`,
      clicks: 100,
      sales: 10,
      salesOrderValue: 1000,
      salesCommission: { publisherCommission: 50 }
    });
    previousRows.push({
      programId: "246020",
      sourceId: `down-${index}`,
      sourceName: `Decline ${index}`,
      clicks: 1000 + index,
      sales: 100 + index,
      salesOrderValue: 10000 + index * 100,
      salesCommission: { publisherCommission: 100 }
    });
  }

  const pack = processPublisherPack(currentRows, previousRows, [], [], [], payload);
  for (const key of ["moversShakersOV", "moversShakersSales", "moversShakersClicks"]) {
    assert.equal(pack.publisherTables[key].length, 20);
    assert.equal(pack.publisherTables[key].filter((row) => row.Direction === "Up").length, 10);
    assert.equal(pack.publisherTables[key].filter((row) => row.Direction === "Down").length, 10);
  }
  assert.equal(pack.publisherOrderValueRanking.top.length, 10);
  assert.equal(pack.publisherOrderValueRanking.bottom.length, 10);
});

