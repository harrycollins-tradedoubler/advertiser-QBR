const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { generatePresentation, saveOutput } = require("./lib/generator");

const PORT = Number(process.env.PORT || 3011);
const API_KEY = process.env.QBR_PPTX_API_KEY || process.env.API_KEY || "td-qbr-pptx-local-2026-secret";
const OUTPUT_DIR = path.join(__dirname, "outputs");
const DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 60;

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

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : fallback;
}

function tokenSecret(apiKey) {
  return process.env.DOWNLOAD_TOKEN_SECRET || apiKey;
}

function signFileToken(fileName, expiresAt, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${fileName}:${expiresAt}`)
    .digest("base64url");
}

function createSignedFileUrl(root, fileName, options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const ttlSeconds = positiveInt(options.ttlSeconds, DEFAULT_DOWNLOAD_TTL_SECONDS);
  const secret = options.secret || tokenSecret(options.apiKey || API_KEY);
  const expiresAt = now() + ttlSeconds * 1000;
  const token = signFileToken(fileName, expiresAt, secret);
  return `${root}/files/${encodeURIComponent(fileName)}?expires=${expiresAt}&token=${encodeURIComponent(token)}`;
}

function verifySignedFileUrl(fileName, query, options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const secret = options.secret || tokenSecret(options.apiKey || API_KEY);
  const expiresAt = Number(query.expires);
  const token = typeof query.token === "string" ? query.token : "";
  if (!Number.isFinite(expiresAt) || expiresAt <= now()) return false;
  if (!token) return false;

  const expected = signFileToken(fileName, expiresAt, secret);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function resolveOutputPath(outputDir, fileName) {
  const root = path.resolve(outputDir);
  const fullPath = path.resolve(root, fileName);
  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) return null;
  return fullPath;
}

function scheduleOutputDeletion(outputDir, fileName, ttlSeconds) {
  const delayMs = Math.min(positiveInt(ttlSeconds, DEFAULT_DOWNLOAD_TTL_SECONDS) * 1000 + 60_000, 2_147_483_647);
  setTimeout(() => {
    const fullPath = resolveOutputPath(outputDir, fileName);
    if (!fullPath) return;
    fs.unlink(fullPath).catch(() => {});
  }, delayMs).unref?.();
}

async function serveFile(req, res, parsed, config) {
  const pathname = parsed.pathname || "";
  const fileName = decodeURIComponent(pathname.replace(/^\/files\//, ""));
  const fullPath = resolveOutputPath(config.outputDir, fileName);
  if (!fullPath) {
    json(res, 400, { success: false, message: "Invalid file path." });
    return;
  }

  const headerKey = req.headers["x-api-key"];
  const hasApiAccess = headerKey && headerKey === config.apiKey;
  const hasSignedAccess = verifySignedFileUrl(fileName, parsed.query || {}, {
    apiKey: config.apiKey,
    secret: config.downloadTokenSecret,
    now: config.now
  });
  if (!hasApiAccess && !hasSignedAccess) {
    json(res, 403, { success: false, message: "File link is missing, invalid, or expired." });
    return;
  }

  try {
    const data = await fs.readFile(fullPath);
    const contentType = fileName.endsWith(".json")
      ? "application/json"
      : fileName.endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${path.basename(fileName).replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff"
    });
    res.end(data);
  } catch (error) {
    json(res, 404, { success: false, message: "File not found." });
  }
}

function createServer(options = {}) {
  const config = {
    apiKey: options.apiKey || API_KEY,
    outputDir: options.outputDir || OUTPUT_DIR,
    downloadTtlSeconds: positiveInt(
      options.downloadTtlSeconds ?? process.env.DOWNLOAD_URL_TTL_SECONDS,
      DEFAULT_DOWNLOAD_TTL_SECONDS
    ),
    downloadTokenSecret: options.downloadTokenSecret || tokenSecret(options.apiKey || API_KEY),
    now: options.now || Date.now,
    generatePresentation: options.generatePresentation || generatePresentation,
    saveOutput: options.saveOutput || saveOutput,
    scheduleDeletion: options.scheduleDeletion !== false
  };

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const parsed = {
      pathname: requestUrl.pathname,
      query: Object.fromEntries(requestUrl.searchParams.entries())
    };
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
      await serveFile(req, res, parsed, config);
      return;
    }

    if (req.method === "POST" && pathname === "/generate") {
      const incomingKey = req.headers["x-api-key"];
      if (!incomingKey || incomingKey !== config.apiKey) {
        json(res, 401, { success: false, message: "Unauthorized" });
        return;
      }

      try {
        const payload = await readBody(req);
        const result = await config.generatePresentation(payload);
        const saved = await config.saveOutput(result, config.outputDir);
        const savedFileName = saved.fileName || result.fileName;
        const root = baseUrl(req);
        const pptxUrl = createSignedFileUrl(root, savedFileName, {
          apiKey: config.apiKey,
          secret: config.downloadTokenSecret,
          ttlSeconds: config.downloadTtlSeconds,
          now: config.now
        });
        const deckSpecUrl = saved.deckSpecFileName
          ? createSignedFileUrl(root, saved.deckSpecFileName, {
            apiKey: config.apiKey,
            secret: config.downloadTokenSecret,
            ttlSeconds: config.downloadTtlSeconds,
            now: config.now
          })
          : null;
        const excelUrl = saved.excelFileName
          ? createSignedFileUrl(root, saved.excelFileName, {
            apiKey: config.apiKey,
            secret: config.downloadTokenSecret,
            ttlSeconds: config.downloadTtlSeconds,
            now: config.now
          })
          : null;

        if (config.scheduleDeletion) {
          scheduleOutputDeletion(config.outputDir, savedFileName, config.downloadTtlSeconds);
          if (saved.deckSpecFileName) {
            scheduleOutputDeletion(config.outputDir, saved.deckSpecFileName, config.downloadTtlSeconds);
          }
          if (saved.excelFileName) {
            scheduleOutputDeletion(config.outputDir, saved.excelFileName, config.downloadTtlSeconds);
          }
        }

        json(res, 200, {
          success: true,
          provider: "qbr-pptx",
          message: "Editable QBR PowerPoint generated successfully.",
          presentation_id: result.deckSpec.metadata.requestId,
          pptx_url: pptxUrl,
          deck_spec_url: deckSpecUrl,
          excel_url: excelUrl,
          download_expires_at: new Date(config.now() + config.downloadTtlSeconds * 1000).toISOString(),
          file_name: savedFileName,
          excel_file_name: saved.excelFileName || null,
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
}

if (require.main === module) {
  const server = createServer();

  server.listen(PORT, () => {
    console.log(`QBR PPTX service listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  createSignedFileUrl,
  verifySignedFileUrl
};
