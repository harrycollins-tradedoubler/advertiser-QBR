const http = require("node:http");

const { createAdvertiserQbrRunner } = require("./lib/advertiserQbrRunner");

const DEFAULT_HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT || 3021);
const ALLOW_DOCKER_BRIDGE_REQUESTS = /^(1|true|yes|on)$/i.test(String(process.env.ALLOW_DOCKER_BRIDGE_REQUESTS || ""));

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept"
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function isLocalhostAddress(address) {
  const value = String(address || "").trim().toLowerCase();
  return value === "127.0.0.1"
    || value === "::1"
    || value === "::ffff:127.0.0.1"
    || value === "localhost";
}

function isDockerBridgeAddress(address) {
  const value = String(address || "").trim().toLowerCase().replace(/^::ffff:/, "");
  const match = value.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
  if (!match) return false;
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLocalRequest(req, options = {}) {
  const allowDockerBridge = Boolean(options.allowDockerBridge ?? ALLOW_DOCKER_BRIDGE_REQUESTS);
  const remote = req.socket?.remoteAddress || "";
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (forwarded.some((item) => !isLocalhostAddress(item))) return false;
  return isLocalhostAddress(remote) || (allowDockerBridge && isDockerBridgeAddress(remote));
}

function createServer(options = {}) {
  const runner = options.runner || createAdvertiserQbrRunner(options.runnerOptions || {});

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept"
      });
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/health") {
      json(res, 200, { ok: true, service: "advertiser-qbr-local-runner" });
      return;
    }

    if (req.method === "POST" && pathname === "/webhook-local/advertiser-qbr") {
      if (!isLocalRequest(req)) {
        json(res, 403, {
          success: false,
          generation_status: "failed",
          message: "Local runner only accepts localhost requests.",
          error: "non_localhost_request"
        });
        return;
      }

      try {
        const body = await readBody(req);
        const result = await runner.run(body);
        json(res, result.success === false ? 500 : 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        json(res, 500, {
          success: false,
          provider: "advertiser-qbr-local-runner",
          generation_status: "failed",
          message: `Advertiser QBR local runner failed: ${message}`,
          error: message
        });
      }
      return;
    }

    json(res, 404, { success: false, message: "Not found" });
  });
}

function listenWithPortFallback(server, host, startPort, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let attempts = 0;

    function tryListen() {
      attempts += 1;
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve(port);
      });
    }

    function onError(error) {
      server.off("error", onError);
      if (error && error.code === "EADDRINUSE" && attempts < maxAttempts) {
        port += 1;
        tryListen();
        return;
      }
      reject(error);
    }

    tryListen();
  });
}

if (require.main === module) {
  const server = createServer();
  listenWithPortFallback(server, DEFAULT_HOST, DEFAULT_PORT)
    .then((port) => {
      console.log(`Advertiser QBR local runner listening on http://${DEFAULT_HOST}:${port}`);
      console.log(`Webhook: http://${DEFAULT_HOST}:${port}/webhook-local/advertiser-qbr`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  createServer,
  isDockerBridgeAddress,
  isLocalhostAddress,
  isLocalRequest,
  listenWithPortFallback
};


