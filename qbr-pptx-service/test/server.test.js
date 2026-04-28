const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

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
