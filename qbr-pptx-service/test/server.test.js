const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createServer } = require("../server");
const { saveOutput } = require("../lib/generator");

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

test("generated file URLs are signed and raw file links are rejected", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-pptx-service-"));
  let nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const server = createServer({
    apiKey: "test-key",
    downloadTokenSecret: "download-secret",
    downloadTtlSeconds: 60,
    outputDir,
    now: () => nowMs,
    scheduleDeletion: false,
    generatePresentation: async () => ({
      deckSpec: {
        metadata: { requestId: "test-request" },
        slides: [{ title: "Test" }],
        theme: { name: "TD" }
      },
      fileName: "report.pptx"
    }),
    saveOutput: async (_result, dir) => {
      await fs.writeFile(path.join(dir, "report.pptx"), "pptx-bytes");
      return { deckSpecFileName: null };
    }
  });

  const root = await listen(server);
  try {
    const generateResponse = await fetch(`${root}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-key"
      },
      body: "{}"
    });
    assert.equal(generateResponse.status, 200);
    const body = await generateResponse.json();
    assert.equal(body.success, true);
    assert.match(body.pptx_url, /\/files\/report\.pptx\?expires=\d+&token=/);
    assert.equal(body.deck_spec_url, null);
    assert.equal(body.download_expires_at, "2026-01-01T12:01:00.000Z");

    const rawResponse = await fetch(`${root}/files/report.pptx`);
    assert.equal(rawResponse.status, 403);

    const signedResponse = await fetch(body.pptx_url);
    assert.equal(signedResponse.status, 200);
    assert.equal(await signedResponse.text(), "pptx-bytes");
    assert.equal(signedResponse.headers.get("cache-control"), "no-store");
    assert.match(signedResponse.headers.get("content-disposition") || "", /attachment/);

    nowMs += 61_000;
    const expiredResponse = await fetch(body.pptx_url);
    assert.equal(expiredResponse.status, 403);
  } finally {
    await close(server);
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("api key can still retrieve files for trusted automation", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-pptx-service-"));
  await fs.writeFile(path.join(outputDir, "report.pptx"), "pptx-bytes");
  const server = createServer({
    apiKey: "test-key",
    outputDir,
    scheduleDeletion: false
  });

  const root = await listen(server);
  try {
    const response = await fetch(`${root}/files/report.pptx`, {
      headers: { "x-api-key": "test-key" }
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "pptx-bytes");
  } finally {
    await close(server);
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("repeated QBR runs with the same requested filename do not overwrite each other", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-pptx-service-"));
  let runNumber = 0;
  const server = createServer({
    apiKey: "test-key",
    downloadTokenSecret: "download-secret",
    downloadTtlSeconds: 60,
    outputDir,
    scheduleDeletion: false,
    generatePresentation: async () => {
      runNumber += 1;
      return {
        normalized: { debug: false },
        deckSpec: {
          metadata: { requestId: `test-request-${runNumber}` },
          slides: [{ title: "Test" }],
          theme: { name: "TD" }
        },
        fileName: "../shared/qbr-report.pptx",
        buffer: Buffer.from(`pptx-bytes-${runNumber}`)
      };
    }
  });

  const root = await listen(server);
  try {
    const generate = () => fetch(`${root}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-key"
      },
      body: "{}"
    });

    const firstResponse = await generate();
    const secondResponse = await generate();
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    const first = await firstResponse.json();
    const second = await secondResponse.json();

    assert.equal(first.file_name, "qbr-report.pptx");
    assert.match(second.file_name, /^qbr-report_[0-9a-f-]+\.pptx$/);
    assert.notEqual(first.file_name, second.file_name);

    assert.equal(await fs.readFile(path.join(outputDir, first.file_name), "utf8"), "pptx-bytes-1");
    assert.equal(await fs.readFile(path.join(outputDir, second.file_name), "utf8"), "pptx-bytes-2");

    const firstDownload = await fetch(first.pptx_url);
    const secondDownload = await fetch(second.pptx_url);
    assert.equal(await firstDownload.text(), "pptx-bytes-1");
    assert.equal(await secondDownload.text(), "pptx-bytes-2");
  } finally {
    await close(server);
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("saveOutput uses create-only writes and appends a UUID instead of overwriting", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-pptx-service-"));
  const baseResult = {
    normalized: { debug: false },
    deckSpec: { metadata: { requestId: "test" }, slides: [], theme: { name: "TD" } },
    fileName: "Collision Report.pptx"
  };

  try {
    const first = await saveOutput({ ...baseResult, buffer: Buffer.from("first") }, outputDir);
    const second = await saveOutput({ ...baseResult, buffer: Buffer.from("second") }, outputDir);

    assert.equal(first.fileName, "collision_report.pptx");
    assert.match(second.fileName, /^collision_report_[0-9a-f-]+\.pptx$/i);
    assert.equal(await fs.readFile(path.join(outputDir, first.fileName), "utf8"), "first");
    assert.equal(await fs.readFile(path.join(outputDir, second.fileName), "utf8"), "second");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
