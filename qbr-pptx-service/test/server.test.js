const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const JSZip = require("jszip");

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
      await fs.writeFile(path.join(dir, "publisher-recommendations.xlsx"), "xlsx-bytes");
      await fs.writeFile(path.join(dir, "publisher-performance.xlsx"), "publisher-performance-bytes");
      await fs.writeFile(path.join(dir, "presenter-notes.docx"), "docx-bytes");
      const bundle = new JSZip();
      bundle.file("report.pptx", "pptx-bytes");
      bundle.file("report_publisher_recommendations.xlsx", "xlsx-bytes");
      bundle.file("report_publisher_performance_by_program.xlsx", "publisher-performance-bytes");
      bundle.file("report_presenter_notes.docx", "docx-bytes");
      await fs.writeFile(path.join(dir, "report_bundle.zip"), await bundle.generateAsync({ type: "nodebuffer" }));
      return {
        deckSpecFileName: null,
        excelFileName: "publisher-recommendations.xlsx",
        publisherPerformanceExcelFileName: "publisher-performance.xlsx",
        presenterNotesFileName: "presenter-notes.docx",
        bundleFileName: "report_bundle.zip"
      };
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
    assert.equal(body.presentation_url, body.pptx_url);
    assert.equal(body.deck_spec_url, null);
    assert.match(body.excel_url, /\/files\/publisher-performance\.xlsx\?expires=\d+&token=/);
    assert.equal(body.excel_file_name, "publisher-performance.xlsx");
    assert.match(body.publisher_recommendations_excel_url, /\/files\/publisher-recommendations\.xlsx\?expires=\d+&token=/);
    assert.equal(body.publisher_recommendations_excel_file_name, "publisher-recommendations.xlsx");
    assert.match(body.publisher_performance_excel_url, /\/files\/publisher-performance\.xlsx\?expires=\d+&token=/);
    assert.equal(body.publisher_performance_excel_file_name, "publisher-performance.xlsx");
    assert.match(body.presenter_notes_url, /\/files\/presenter-notes\.docx\?expires=\d+&token=/);
    assert.equal(body.presenter_notes_file_name, "presenter-notes.docx");
    assert.equal(body.presenter_notes_warning, null);
    assert.match(body.bundle_url, /\/files\/report_bundle\.zip\?expires=\d+&token=/);
    assert.equal(body.bundle_file_name, "report_bundle.zip");
    assert.equal(body.download_expires_at, "2026-01-01T12:01:00.000Z");

    const rawResponse = await fetch(`${root}/files/report.pptx`);
    assert.equal(rawResponse.status, 403);

    const signedResponse = await fetch(body.pptx_url);
    assert.equal(signedResponse.status, 200);
    assert.equal(await signedResponse.text(), "pptx-bytes");
    assert.equal(signedResponse.headers.get("cache-control"), "no-store");
    assert.match(signedResponse.headers.get("content-disposition") || "", /attachment/);

    const excelResponse = await fetch(body.excel_url);
    assert.equal(excelResponse.status, 200);
    assert.equal(await excelResponse.text(), "publisher-performance-bytes");
    assert.equal(
      excelResponse.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const recommendationResponse = await fetch(body.publisher_recommendations_excel_url);
    assert.equal(recommendationResponse.status, 200);
    assert.equal(await recommendationResponse.text(), "xlsx-bytes");

    const publisherPerformanceResponse = await fetch(body.publisher_performance_excel_url);
    assert.equal(publisherPerformanceResponse.status, 200);
    assert.equal(await publisherPerformanceResponse.text(), "publisher-performance-bytes");

    const presenterNotesResponse = await fetch(body.presenter_notes_url);
    assert.equal(presenterNotesResponse.status, 200);
    assert.equal(presenterNotesResponse.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(await presenterNotesResponse.text(), "docx-bytes");

    const bundleResponse = await fetch(body.bundle_url);
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get("content-type"), "application/zip");
    const bundle = await JSZip.loadAsync(Buffer.from(await bundleResponse.arrayBuffer()));
    assert.equal(await bundle.file("report.pptx").async("string"), "pptx-bytes");
    assert.equal(await bundle.file("report_publisher_recommendations.xlsx").async("string"), "xlsx-bytes");
    assert.equal(await bundle.file("report_publisher_performance_by_program.xlsx").async("string"), "publisher-performance-bytes");
    assert.equal(await bundle.file("report_presenter_notes.docx").async("string"), "docx-bytes");

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

test("saveOutput creates a client-labeled ZIP bundle", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-pptx-service-"));
  const result = {
    normalized: { debug: false },
    deckSpec: { metadata: { requestId: "test" }, slides: [], theme: { name: "TD" } },
    fileName: "QBR - Sinsay PL 11111111-2222-3333-4444-555555555555.pptx",
    buffer: Buffer.from("pptx-bytes"),
    excelBuffer: Buffer.from("recommendations-bytes"),
    excelFileName: "qbr_deck_publisher_recommendations.xlsx",
    publisherPerformanceExcelBuffer: Buffer.from("performance-bytes"),
    publisherPerformanceExcelFileName: "qbr_deck_publisher_performance_by_program.xlsx",
    presenterNotesBuffer: Buffer.from("notes-bytes"),
    presenterNotesFileName: "qbr_deck_presenter_notes.docx"
  };

  try {
    const saved = await saveOutput(result, outputDir);
    assert.equal(saved.bundleFileName, `${path.basename(saved.fileName, ".pptx")}_bundle.zip`);
    const bundle = await JSZip.loadAsync(await fs.readFile(path.join(outputDir, saved.bundleFileName)));

    assert.equal(await bundle.file("qbr_-_sinsay_pl.pptx").async("string"), "pptx-bytes");
    assert.equal(await bundle.file("qbr_-_sinsay_pl_publisher_recommendations.xlsx").async("string"), "recommendations-bytes");
    assert.equal(await bundle.file("qbr_-_sinsay_pl_publisher_performance_by_program.xlsx").async("string"), "performance-bytes");
    assert.equal(await bundle.file("qbr_-_sinsay_pl_presenter_notes.docx").async("string"), "notes-bytes");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

test("presenter notes metadata is exposed from generation responses", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbr-pptx-service-"));
  const server = createServer({
    apiKey: "test-key",
    outputDir,
    scheduleDeletion: false,
    generatePresentation: async () => ({
      normalized: { debug: false },
      deckSpec: {
        metadata: { requestId: "test-request" },
        slides: [{ title: "Test" }],
        theme: { name: "TD" }
      },
      fileName: "report.pptx",
      buffer: Buffer.from("pptx-bytes"),
      presenterNotesBuffer: Buffer.from("notes-bytes"),
      presenterNotesFileName: "qbr_deck_presenter_notes.docx",
      presenterNotesWarning: null
    })
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
    assert.match(body.presenter_notes_url, /\/files\/report_presenter_notes\.docx\?expires=\d+&token=/);
    assert.equal(body.presenter_notes_file_name, "report_presenter_notes.docx");
    assert.equal(body.presenter_notes_warning, null);
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
    const first = await saveOutput({
      ...baseResult,
      buffer: Buffer.from("first"),
      presenterNotesBuffer: Buffer.from("first-notes")
    }, outputDir);
    const second = await saveOutput({
      ...baseResult,
      buffer: Buffer.from("second"),
      presenterNotesBuffer: Buffer.from("second-notes")
    }, outputDir);

    assert.equal(first.fileName, "collision_report.pptx");
    assert.match(second.fileName, /^collision_report_[0-9a-f-]+.pptx$/i);
    assert.equal(first.presenterNotesFileName, "collision_report_presenter_notes.docx");
    assert.match(second.presenterNotesFileName, /^collision_report_[0-9a-f-]+_presenter_notes\.docx$/i);
    assert.equal(await fs.readFile(path.join(outputDir, first.fileName), "utf8"), "first");
    assert.equal(await fs.readFile(path.join(outputDir, second.fileName), "utf8"), "second");
    assert.equal(await fs.readFile(path.join(outputDir, first.presenterNotesFileName), "utf8"), "first-notes");
    assert.equal(await fs.readFile(path.join(outputDir, second.presenterNotesFileName), "utf8"), "second-notes");
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});
