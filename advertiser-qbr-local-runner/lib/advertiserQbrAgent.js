const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.ADVERTISER_QBR_OPENAI_MODEL || "gpt-5-mini";

function validateAgentJson(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`Agent returned malformed JSON: ${error.message}`);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Agent output must be a JSON object.");
  }
  if (typeof parsed.output !== "string" || !parsed.output.trim()) {
    throw new Error("Agent output must include a non-empty output string.");
  }
  if (parsed.insights !== undefined && !Array.isArray(parsed.insights)) {
    throw new Error("Agent output insights must be an array when provided.");
  }
  return {
    output: parsed.output.trim(),
    insights: Array.isArray(parsed.insights) ? parsed.insights.map(String) : []
  };
}

function runAllowlistedTool(name, input) {
  if (name !== "summarize_table") {
    throw new Error(`Tool ${name} is not allowlisted.`);
  }
  if (!input || !Array.isArray(input.rows)) {
    throw new Error("summarize_table input.rows must be an array.");
  }
  const columns = Array.from(new Set(
    input.rows.flatMap((row) => row && typeof row === "object" && !Array.isArray(row) ? Object.keys(row) : [])
  ));
  return { rowCount: input.rows.length, columns };
}

function deterministicOutput(kind, context = {}) {
  const payload = context.payload || {};
  const reportingPeriod = payload.reportingPeriod || "N/A";
  const comparisonPeriod = payload.comparisonPeriod || "N/A";
  if (kind === "publisher") {
    return {
      output: [
        "## Publisher Performance",
        "",
        "### Reporting Period",
        `- Current period: ${reportingPeriod}; YoY comparison: ${comparisonPeriod}.`,
        "",
        "### Top YoY Growth Publishers",
        "- Publisher movements are calculated from fetched TD rows.",
        "",
        "### Movers & Shakers",
        "- Sales, order value, clicks, and AOV movers are table-driven."
      ].join("\n"),
      insights: ["publisher deterministic fallback"]
    };
  }
  return {
    output: [
      "## Program Performance (YoY)",
      "",
      "### Reporting Period",
      `- Current period: ${reportingPeriod}; YoY comparison: ${comparisonPeriod}.`,
      "",
      "### KPI Snapshot",
      "- KPI values are calculated from fetched TD rows.",
      "",
      "### Confirmed Changes",
      "- Driver not confirmed from available data."
    ].join("\n"),
    insights: ["program deterministic fallback"]
  };
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  if (Array.isArray(data?.output)) {
    const texts = [];
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (typeof content.text === "string") texts.push(content.text);
        }
      }
    }
    if (texts.length) return texts.join("\n");
  }
  return "";
}

function createAdvertiserQbrAgent(options = {}) {
  const mode = options.mode || process.env.ADVERTISER_QBR_AGENT_MODE || (process.env.OPENAI_API_KEY ? "model" : "deterministic");
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || "";
  const model = options.model || DEFAULT_MODEL;
  const maxIterations = Math.max(1, Number(options.maxIterations || 4));
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  async function run(context = {}) {
    const kind = context.kind || "program";
    if (mode === "deterministic" || !apiKey) {
      return deterministicOutput(kind, context);
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch is required for model agent mode.");
    }

    const messages = [
      `Return strict JSON with shape {"output":"markdown","insights":["short"]}.`,
      `Kind: ${kind}`,
      String(context.dataForAI || "")
    ].join("\n\n");

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: messages,
          text: { format: { type: "json_object" } }
        })
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        throw new Error(`OpenAI agent failed: HTTP ${response.status} ${data.error?.message || text}`);
      }
      if (data.tool_call) {
        runAllowlistedTool(data.tool_call.name, data.tool_call.input);
        continue;
      }
      return validateAgentJson(extractResponseText(data) || data);
    }
    throw new Error(`Agent reached maxIterations ${maxIterations}.`);
  }

  return { run };
}

module.exports = {
  createAdvertiserQbrAgent,
  validateAgentJson,
  runAllowlistedTool
};
