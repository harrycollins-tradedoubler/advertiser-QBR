const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = require("node:url");

const { generatePresentation, saveOutput } = require("./lib/generator");

const PORT = Number(process.env.PORT || 3010);
const API_KEY = process.env.QBR_PPTX_API_KEY || process.env.API_KEY || "td-qbr-pptx-local-2026-secret";
const OUTPUT_DIR = path.join(__dirname, "outputs");

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, x-api-key"
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function baseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}`;
}

async function serveFile(req, res, pathname) {
  const fileName = decodeURIComponent(pathname.replace(/^\/files\//, ""));
  const fullPath = path.join(OUTPUT_DIR, fileName);
  if (!fullPath.startsWith(OUTPUT_DIR)) {
    json(res, 400, { success: false, message: "Invalid file path." });
    return;
  }

  try {
    const data = await fs.readFile(fullPath);
    const contentType = fileName.endsWith(".json")
      ? "application/json"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*"
    });
    res.end(data);
  } catch (error) {
    json(res, 404, { success: false, message: "File not found." });
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || "", true);
  const pathname = parsed.pathname || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, x-api-key"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    json(res, 200, { ok: true, service: "qbr-pptx-service" });
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/files/")) {
    await serveFile(req, res, pathname);
    return;
  }

  if (req.method === "POST" && pathname === "/generate") {
    const incomingKey = req.headers["x-api-key"];
    if (!incomingKey || incomingKey !== API_KEY) {
      json(res, 401, { success: false, message: "Unauthorized" });
      return;
    }

    try {
      const payload = await readBody(req);
      const result = await generatePresentation(payload);
      const saved = await saveOutput(result, OUTPUT_DIR);
      const root = baseUrl(req);

      json(res, 200, {
        success: true,
        provider: "qbr-pptx",
        message: "Editable QBR PowerPoint generated successfully.",
        presentation_id: result.deckSpec.metadata.requestId,
        pptx_url: `${root}/files/${encodeURIComponent(result.fileName)}`,
        deck_spec_url: saved.deckSpecFileName ? `${root}/files/${encodeURIComponent(saved.deckSpecFileName)}` : null,
        file_name: result.fileName,
        slide_count: result.deckSpec.slides.length,
        theme: result.deckSpec.theme.name
      });
    } catch (error) {
      json(res, 500, {
        success: false,
        message: "Failed to generate PPTX.",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    return;
  }

  json(res, 404, { success: false, message: "Not found" });
});

server.listen(PORT, () => {
  console.log(`QBR PPTX service listening on http://localhost:${PORT}`);
});
