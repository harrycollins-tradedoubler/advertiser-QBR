const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.QBR_AUTO_TRANSLATE = "0";

const { generatePresentation } = require("../lib/generator");
const { createServer } = require("../server");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, () => {
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

function publisherPayload(overrides = {}) {
  return {
    analysisLevel: "publisher_program",
    client: "Publisher Boundary Test",
    deckTitle: "Publisher QBR - Boundary Test",
    outputFileName: "Publisher Boundary Test.pptx",
    fullContent: true,
    includeAppendix: false,
    languageCode: "EN",
    currencyCode: "EUR",
    reportingPeriod: "2026-01-01 to 2026-03-31",
    comparisonPeriod: "2025-01-01 to 2025-03-31",
    programYoYTable: [
      { Row: "Recent", Clicks: "1000", Sales: "100", "Conv Rate": "10%", AOV: "EUR 50", "Order value": "EUR 5000", "Publ Commission": "EUR 500", CPA: "EUR 5", ROI: "10" },
      { Row: "Previous", Clicks: "900", Sales: "90", "Conv Rate": "10%", AOV: "EUR 45", "Order value": "EUR 4050", "Publ Commission": "EUR 450", CPA: "EUR 5", ROI: "9" },
      { Row: "Difference", Clicks: "100", Sales: "10", "Conv Rate": "0%", AOV: "EUR 5", "Order value": "EUR 950", "Publ Commission": "EUR 50", CPA: "EUR 0", ROI: "1" },
      { Row: "% Variance", Clicks: "11.1%", Sales: "11.1%", "Conv Rate": "0%", AOV: "11.1%", "Order value": "23.5%", "Publ Commission": "11.1%", CPA: "0%", ROI: "11.1%" }
    ],
    publisherTables: {
      publisherPerformanceSummary: [
        { Publisher: "Publisher A", Segment: "Cashback", "Order Value": "EUR 3000", "Current Sales": "60", "Sales YoY %": "20%" }
      ],
      programLevelBreakdown: [
        { Program: "Program A", "Program ID": "123", "Current OV": "EUR 3000", "OV YoY %": "20%", "Current Sales": "60", "Sales YoY %": "20%" }
      ],
      brandNewPrograms: [
        { Program: "New Program", "Program ID": "456", "Current OV": "EUR 500", "Current Sales": "10" }
      ]
    },
    ...overrides
  };
}

test("publisher QBR payload produces publisher template slides", async () => {
  const result = await generatePresentation(publisherPayload());
  const titles = result.deckSpec.slides.map((slide) => slide.title);

  assert.equal(result.deckSpec.metadata.analysisLevel, "publisher_program");
  assert.ok(titles.includes("Publisher Performance Summary"));
  assert.ok(titles.includes("Program Level Analysis"));
  assert.ok(titles.includes("Brand New Programs"));
});

test("advertiser-style payload is rejected by the publisher service", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "publisher-qbr-service-"));
  let called = false;
  const server = createServer({
    apiKey: "test-key",
    outputDir,
    scheduleDeletion: false,
    generatePresentation: async () => {
      called = true;
      throw new Error("should not route advertiser payload to publisher generator");
    }
  });

  const root = await listen(server);
  try {
    const response = await fetch(`${root}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "test-key" },
      body: JSON.stringify({ client: "Advertiser QBR", programYoYTable: [] })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.message, /publisher_program/i);
    assert.equal(called, false);
  } finally {
    await close(server);
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("two publisher runs with the same outputFileName create separate files and signed URLs", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "publisher-qbr-service-"));
  const server = createServer({
    apiKey: "test-key",
    downloadTokenSecret: "download-secret",
    outputDir,
    scheduleDeletion: false,
    generatePresentation: async () => ({
      normalized: { debug: false },
      deckSpec: {
        metadata: { requestId: "publisher-request", analysisLevel: "publisher_program" },
        slides: [{ title: "Publisher Performance Summary" }],
        theme: { name: "TD" }
      },
      buffer: Buffer.from(`pptx-${Date.now()}-${Math.random()}`),
      fileName: "same-name.pptx"
    })
  });

  const root = await listen(server);
  try {
    const request = () => fetch(`${root}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "test-key" },
      body: JSON.stringify(publisherPayload({ outputFileName: "same-name.pptx" }))
    });

    const first = await request();
    const second = await request();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const firstBody = await first.json();
    const secondBody = await second.json();
    assert.equal(firstBody.file_name, "same-name.pptx");
    assert.match(secondBody.file_name, /^same-name_[0-9a-f-]+\.pptx$/i);
    assert.notEqual(firstBody.file_name, secondBody.file_name);
    assert.match(firstBody.pptx_url, new RegExp(`/files/${firstBody.file_name.replace(".", "\\.")}\\?expires=`));
    assert.match(secondBody.pptx_url, new RegExp(`/files/${secondBody.file_name.replace(".", "\\.")}\\?expires=`));

    const files = await fs.readdir(outputDir);
    assert.ok(files.includes(firstBody.file_name));
    assert.ok(files.includes(secondBody.file_name));
  } finally {
    await close(server);
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
