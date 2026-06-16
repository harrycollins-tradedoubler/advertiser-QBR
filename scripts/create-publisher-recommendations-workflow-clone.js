const fs = require("fs");
const path = require("path");

const workflowDir = path.join(__dirname, "..", "workflows", "coe_n8n_coe_untrust_eu_de_prod_tddrift");
const sourcePath = path.join(workflowDir, "Advertiser Agent QBR - Backend Auth.json");
const targetPath = path.join(workflowDir, "Advertiser QBR Recommendations Test.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findNode(workflow, name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`Missing node: ${name}`);
  return node;
}

function addOrReplaceNode(workflow, node) {
  workflow.nodes = workflow.nodes.filter((item) => item.name !== node.name);
  workflow.nodes.push(node);
}

function setMainConnection(workflow, from, outputs) {
  workflow.connections[from] = { main: outputs };
}

function itemConnection(node, index = 0) {
  return { node, type: "main", index };
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Could not find insertion point: ${label}`);
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (source.id !== "WpsIHbeMDD86vg5y") {
  throw new Error(`Expected source workflow WpsIHbeMDD86vg5y, found ${source.id}`);
}

const workflow = clone(source);
workflow.id = "EDIApI22XKSU9moB";
workflow.name = "Advertiser QBR Recommendations Test";
workflow.active = false;

const webhookNode = findNode(workflow, "Webhook1");
webhookNode.parameters.path = "advertiser-agent-qbr-recommendations-test";
webhookNode.webhookId = "advertiser-agent-qbr-recommendations-test";

addOrReplaceNode(workflow, {
  parameters: {
    jsCode: `const payload = $node["yoy data extraction1"]?.json?.payload || {};

const ids = Array.from(new Set(
  [
    ...(Array.isArray(payload.publisherProgramIds) ? payload.publisherProgramIds : []),
    ...(Array.isArray(payload.programIds) ? payload.programIds : [])
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
));

const fallback = [payload.publisherProgramId, payload.programId]
  .map((v) => String(v || "").trim())
  .filter(Boolean);

const programIds = ids.length ? ids : Array.from(new Set(fallback));
const limit = Math.max(1, Math.min(100, Number(payload.publisherSourceLimit || 100)));
const maxPages = Math.max(1, Math.min(25, Number(payload.publisherSourceMaxPages || 10)));

return programIds.flatMap((programId) =>
  Array.from({ length: maxPages }, (_, pageIndex) => ({
    json: {
      programId,
      limit,
      offset: pageIndex * limit,
      pageIndex,
    },
  }))
);`
  },
  name: "Init Publisher Source Metadata Requests",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [176, 1104]
});

addOrReplaceNode(workflow, {
  parameters: {
    url: `={{ (() => {
  const payload = $('yoy data extraction1').first().json.payload || {};
  const base = String(payload.publisherMetadataEndpoint || 'https://connect.tradedoubler.com/advertiser/sources').replace(/\\?+$/, '');
  const joiner = base.includes('?') ? '&' : '?';
  return base + joiner + 'limit=' + encodeURIComponent($json.limit) + '&offset=' + encodeURIComponent($json.offset) + '&programId=' + encodeURIComponent($json.programId);
})() }}`,
    options: {},
    headerParametersUi: {
      parameter: [
        {
          name: "Authorization",
          value: "={{ (() => {\n  const src = $('receive payload1').first().json;\n  const token =\n    src.td_tokens?.impersonate_access_token ||\n    src.body?.td_tokens?.impersonate_access_token ||\n    src.payload?.td_tokens?.impersonate_access_token ||\n    '';\n  if (!token) throw new Error('Missing td_tokens.impersonate_access_token in receive payload1');\n  return `Bearer ${token}`;\n})() }}"
        },
        { name: "Accept", value: "application/json" }
      ]
    }
  },
  name: "API Publisher Sources Metadata",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 2,
  position: [560, 1104],
  continueOnFail: true
});

addOrReplaceNode(workflow, {
  parameters: {
    jsCode: `const inputItems = $input.all();
const requestItems = (() => {
  try {
    return $items("Init Publisher Source Metadata Requests").map((item) => item.json || {});
  } catch {
    return [];
  }
})();
const bySource = new Map();
let requestCount = 0;
let responseTotalMax = 0;
let responseRowCount = 0;
let errorCount = 0;

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function extractThemes(description) {
  const text = asText(description).toLowerCase();
  const terms = [
    "content", "competition", "offers", "freebies", "discount", "price comparison",
    "reviews", "finance", "cashback", "loyalty", "travel", "holiday", "email",
    "affiliate", "community", "local", "reward", "points", "flight", "shopping",
    "directory", "voucher", "coupon", "technology", "home", "fashion"
  ];
  return terms.filter((term) => text.includes(term)).slice(0, 8);
}

function summarizeDescription(description) {
  const text = asText(description).replace(/\\s+/g, " ");
  if (!text) return "";
  return text.length <= 220 ? text : text.slice(0, 217).trimEnd() + "...";
}

function rowsFromResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.rows)) return response.rows;
  return [];
}

function pairedRequestIndex(item, fallbackIndex) {
  const paired = Array.isArray(item.pairedItem) ? item.pairedItem[0] : item.pairedItem;
  const index = Number(paired?.item);
  return Number.isInteger(index) && index >= 0 ? index : fallbackIndex;
}

for (const inputItem of inputItems) {
  const response = inputItem.json || {};
  const requestProgramId = asText(
    response.programId ||
    response.request?.programId ||
    requestItems[pairedRequestIndex(inputItem, requestCount)]?.programId
  );
  requestCount += 1;
  if (response.error || response.message?.includes?.("Error")) {
    errorCount += 1;
  }
  const rows = rowsFromResponse(response);
  responseRowCount += rows.length;
  responseTotalMax = Math.max(responseTotalMax, Number(response.total || 0));

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const sourceId = asText(
      row.sourceId ||
      row.sourceID ||
      row.source?.id ||
      row.publisher?.sourceId ||
      row.publisher?.sourceID ||
      row.publisher?.id ||
      row.id
    );
    const sourceName = asText(row.sourceName || row.name || row.publisher?.name);
    const url = asText(row.url);
    const programId = asText(row.programId || row.program?.id || requestProgramId);
    const sourceKey = sourceId ? "id:" + sourceId : sourceName ? "name:" + sourceName.toLowerCase() : url ? "url:" + url.toLowerCase() : "";
    if (!sourceKey) continue;
    const key = (programId ? "program:" + programId + "|" : "") + sourceKey;

    const existing = bySource.get(key) || {
      programId,
      sourceId,
      sourceName,
      countryCode: asText(row.countryCode),
      categoryIds: [],
      sourceTypeId: row.sourceTypeId ?? null,
      promotionTypeId: row.promotionTypeId ?? null,
      promotionTypeName: asText(row.promotionTypeName, "Unclassified"),
      url,
      trafficSizeId: Number(row.trafficSizeId || 0),
      crSales: Number(row.crSales || 0),
      acceptedConnections: Number(row.acceptedConnections || 0),
      rejectedConnections: Number(row.rejectedConnections || 0),
      totalConnections: Number(row.acceptedConnections || 0) + Number(row.rejectedConnections || 0),
      acceptanceRatio: row.acceptanceRatio === null || row.acceptanceRatio === undefined ? null : Number(row.acceptanceRatio),
      sourceNew: Boolean(row.sourceNew),
      created: asText(row.created),
      description: summarizeDescription(row.description),
      themes: [],
    };

    const categoryIds = Array.isArray(row.categoryIds) ? row.categoryIds : [];
    if (!existing.programId && programId) existing.programId = programId;
    existing.categoryIds = Array.from(new Set([...existing.categoryIds, ...categoryIds.map((id) => String(id))]));
    existing.themes = Array.from(new Set([...existing.themes, ...extractThemes(row.description)]));
    existing.acceptedConnections = Math.max(existing.acceptedConnections, Number(row.acceptedConnections || 0));
    existing.rejectedConnections = Math.max(existing.rejectedConnections, Number(row.rejectedConnections || 0));
    existing.totalConnections = Math.max(existing.totalConnections || 0, Number(row.acceptedConnections || 0) + Number(row.rejectedConnections || 0));
    existing.trafficSizeId = Math.max(existing.trafficSizeId, Number(row.trafficSizeId || 0));
    if (!existing.description) existing.description = summarizeDescription(row.description);
    if (existing.acceptanceRatio === null && row.acceptanceRatio !== null && row.acceptanceRatio !== undefined) {
      existing.acceptanceRatio = Number(row.acceptanceRatio);
    }

    bySource.set(key, existing);
  }
}

const allItems = Array.from(bySource.values());

return [{
  json: {
    items: allItems,
    allItems,
    diagnostics: {
      requestCount,
      responseRowCount,
      uniqueSources: allItems.length,
      responseTotalMax,
      errorCount,
      truncated: responseTotalMax > allItems.length,
    },
  },
}];`
  },
  name: "Collect Publisher Sources Metadata",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [784, 1104]
});

workflow.nodes = workflow.nodes.filter((item) => item.name !== "Merge Publisher Source Metadata");
findNode(workflow, "Merge").parameters = { numberInputs: 3 };

setMainConnection(workflow, "Merge4", [[
  itemConnection("Process YoY Data1", 0),
  itemConnection("Init Publisher Current Requests", 0),
  itemConnection("Init Publisher Previous Requests", 0),
  itemConnection("Init Publisher Category Current Requests", 0),
  itemConnection("Init Publisher Category Previous Requests", 0),
  itemConnection("Init Publisher Source Metadata Requests", 0),
]]);
setMainConnection(workflow, "Init Publisher Source Metadata Requests", [[itemConnection("API Publisher Sources Metadata", 0)]]);
setMainConnection(workflow, "API Publisher Sources Metadata", [[itemConnection("Collect Publisher Sources Metadata", 0)]]);
setMainConnection(workflow, "Merge5", [[itemConnection("Merge", 0)]]);
setMainConnection(workflow, "Merge Publisher Categories Current", [[itemConnection("Merge", 1)]]);
setMainConnection(workflow, "Collect Publisher Sources Metadata", [[itemConnection("Merge", 2)]]);
setMainConnection(workflow, "Merge", [[itemConnection("Process Publisher QBR Pack", 0)]]);

const processNode = findNode(workflow, "Process Publisher QBR Pack");
let processCode = processNode.parameters.jsCode;
assertIncludes(processCode, "const NODE_CAT_PREV = 'Collect Publisher Category Previous';", "publisher source node constant");
processCode = processCode.replace(
  "const NODE_CAT_PREV = 'Collect Publisher Category Previous';",
  "const NODE_CAT_PREV = 'Collect Publisher Category Previous';\nconst NODE_SOURCE_META = 'Collect Publisher Sources Metadata';"
);

const recommendationFunctions = `
function sourceMetaCategory(item) {
  return normalizePublisherName(item.promotionTypeName || item.category || 'Unclassified', 'Unclassified');
}

function sourceMetaKey(item) {
  const sourceId = item.sourceId || item.sourceID || item.siteId || item.publisherId || '';
  if (sourceId) return 'id:' + String(sourceId).trim();
  const name = item.sourceName || item.publisher || item.publisherName || '';
  return name ? 'name:' + normKey(name) : '';
}

function performanceRowKeys(row) {
  const keys = [];
  if (row.siteId) keys.push('id:' + String(row.siteId).trim());
  if (row.publisher) keys.push('name:' + normKey(row.publisher));
  return keys;
}

function compactEvidence(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).slice(0, 4);
}

function buildPublisherCategoryRecommendationSlides(_mappedRowsInput, metadataRowsInput, options = {}) {
  const maxCategories = Math.max(1, Math.min(100, Number(options.maxCategories || 100)));
  const maxPublishers = Math.max(1, Math.min(20, Number(options.maxPublishers || 10)));
  const groups = new Map();

  function ensureGroup(category, programId) {
    const categoryKey = normalizePublisherName(category || 'Unclassified', 'Unclassified');
    const programKey = normalizePublisherName(programId || 'Publisher Recommendations', 'Publisher Recommendations');
    const key = programKey + '|' + categoryKey;
    if (!groups.has(key)) {
      groups.set(key, {
        category: categoryKey,
        programId: programKey,
        recommendationRows: [],
        acceptedConnections: 0,
        totalConnections: 0,
        acceptanceRatioTotal: 0,
        acceptanceRatioCount: 0,
        trafficSize: 0,
        metadataCount: 0,
      });
    }
    return groups.get(key);
  }

  for (const item of metadataRowsInput || []) {
    const category = sourceMetaCategory(item);
    const programId = item.programId || item.publisherProgramId || item['Program ID'] || '';
    const group = ensureGroup(category, programId);
    const ratio = item.acceptanceRatio === null || item.acceptanceRatio === undefined ? null : safeNum(item.acceptanceRatio);
    group.metadataCount += 1;
    group.acceptedConnections += safeNum(item.acceptedConnections);
    group.totalConnections += safeNum(item.totalConnections) || (safeNum(item.acceptedConnections) + safeNum(item.rejectedConnections));
    group.trafficSize += safeNum(item.trafficSizeId);
    if (ratio !== null) {
      group.acceptanceRatioTotal += ratio;
      group.acceptanceRatioCount += 1;
    }
    group.recommendationRows.push(item);
  }

  const rankedGroups = Array.from(groups.values())
    .map((group) => {
      const averageAcceptanceRatio = group.acceptanceRatioCount
        ? group.acceptanceRatioTotal / group.acceptanceRatioCount
        : 0;
      const recommendationStrength = group.recommendationRows.reduce((sum, row) => {
        const ratio = row.acceptanceRatio === null || row.acceptanceRatio === undefined ? 0 : safeNum(row.acceptanceRatio);
        return sum
          + ratio
          + (safeNum(row.totalConnections) || (safeNum(row.acceptedConnections) + safeNum(row.rejectedConnections))) / 10
          + safeNum(row.acceptedConnections) / 25
          + safeNum(row.trafficSizeId) * 5
          + (toBoolean(row.sourceNew, false) ? 8 : 0);
      }, 0);
      const score = recommendationStrength + group.metadataCount * 2 + averageAcceptanceRatio + group.totalConnections / 25;
      return { ...group, averageAcceptanceRatio, recommendationStrength, score };
    })
    .filter((group) => group.metadataCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCategories);

  return rankedGroups.map((group) => {
    const recommendedPublishers = group.recommendationRows
      .sort((a, b) => {
        const ar = a.acceptanceRatio === null || a.acceptanceRatio === undefined ? -1 : safeNum(a.acceptanceRatio);
        const br = b.acceptanceRatio === null || b.acceptanceRatio === undefined ? -1 : safeNum(b.acceptanceRatio);
        const at = safeNum(a.totalConnections) || (safeNum(a.acceptedConnections) + safeNum(a.rejectedConnections));
        const bt = safeNum(b.totalConnections) || (safeNum(b.acceptedConnections) + safeNum(b.rejectedConnections));
        return bt - at
          || br - ar
          || safeNum(b.acceptedConnections) - safeNum(a.acceptedConnections)
          || safeNum(b.trafficSizeId) - safeNum(a.trafficSizeId)
          || Number(toBoolean(b.sourceNew, false)) - Number(toBoolean(a.sourceNew, false));
      })
      .slice(0, maxPublishers)
      .map((row) => ({
        'Publisher Name': row.sourceName || row.publisher || 'Unknown publisher',
        'Source ID': row.sourceId || row.sourceID || row.siteId || row.publisherId || '-',
        'Program ID': row.programId || group.programId || '-',
        'Promotion Type': row.promotionTypeName || group.category,
        Description: row.description || (Array.isArray(row.themes) ? row.themes.slice(0, 4).join(', ') : ''),
        URL: row.url || '-',
        'Total Connections': fmtInt(safeNum(row.totalConnections) || (safeNum(row.acceptedConnections) + safeNum(row.rejectedConnections))),
        'Acceptance Ratio': row.acceptanceRatio === null || row.acceptanceRatio === undefined ? 'N/A' : safeNum(row.acceptanceRatio).toFixed(1) + '%',
        'Accepted Connections': fmtInt(safeNum(row.acceptedConnections)),
        'Rejected Connections': fmtInt(safeNum(row.rejectedConnections)),
      }));

    const evidence = compactEvidence([
      group.metadataCount ? String(group.metadataCount) + ' reviewable publisher source(s)' : '',
      group.totalConnections ? fmtInt(group.totalConnections) + ' total connection signal(s)' : '',
      group.acceptanceRatioCount ? 'Avg acceptance ratio ' + group.averageAcceptanceRatio.toFixed(1) + '%' : '',
      group.acceptedConnections ? fmtInt(group.acceptedConnections) + ' accepted network connection(s)' : '',
    ]);

    const recommendation = 'Review the top 10 unconnected ' + group.category + ' publishers ranked by total connections and acceptance ratio to identify expansion targets for the programme.';

    return {
      programId: group.programId,
      category: group.category,
      recommendation,
      evidence,
      recommendedPublishers,
      opportunityPublishers: recommendedPublishers,
      diagnostics: {
        performanceRows: 0,
        metadataRows: group.metadataCount,
        matchedMetadataRows: 0,
        opportunityRows: group.recommendationRows.length,
        source: 'advertiser/sources',
        score: Number(group.score.toFixed(2)),
      },
    };
  });
}
`;
const currentNodeNeedle = "const currentNodeJson = $node[NODE_CUR].json;";
assertIncludes(processCode, currentNodeNeedle, "recommendation helper insertion");
processCode = processCode.replace(currentNodeNeedle, `${recommendationFunctions}\n${currentNodeNeedle}`);

assertIncludes(processCode, "const categoryPreviousNodeJson = $node[NODE_CAT_PREV]?.json || {};", "source metadata node json");
processCode = processCode.replace(
  "const categoryPreviousNodeJson = $node[NODE_CAT_PREV]?.json || {};",
  "const categoryPreviousNodeJson = $node[NODE_CAT_PREV]?.json || {};\nconst sourceMetadataNodeJson = $node[NODE_SOURCE_META]?.json || {};"
);
assertIncludes(processCode, "const categoryPreviousRaw = getItemsFromNodeJson(categoryPreviousNodeJson);", "source metadata raw");
processCode = processCode.replace(
  "const categoryPreviousRaw = getItemsFromNodeJson(categoryPreviousNodeJson);",
  "const categoryPreviousRaw = getItemsFromNodeJson(categoryPreviousNodeJson);\nconst sourceMetadataRaw = getItemsFromNodeJson(sourceMetadataNodeJson);"
);
assertIncludes(processCode, "const segmentSummary = categorySegmentSummary.length ? categorySegmentSummary : inferredSegmentSummary.slice(0, 5);", "category slides build");
processCode = processCode.replace(
  "const segmentSummary = categorySegmentSummary.length ? categorySegmentSummary : inferredSegmentSummary.slice(0, 5);",
  `const segmentSummary = categorySegmentSummary.length ? categorySegmentSummary : inferredSegmentSummary.slice(0, 5);
const publisherCategoryRecommendationSlides = buildPublisherCategoryRecommendationSlides(mappedRows.filter(r => !r.isTest), sourceMetadataRaw, {
  maxCategories: payload.maxPublisherRecommendationCategories || payload.maxPublisherRecommendationCategories === 0 ? payload.maxPublisherRecommendationCategories : 100,
  maxPublishers: payload.maxPublishersPerRecommendationCategory || payload.maxPublishersPerRecommendationCategory === 0 ? payload.maxPublishersPerRecommendationCategory : 10,
});
const publisherRecommendationPack = {
  source: 'advertiser/sources',
  slides: publisherCategoryRecommendationSlides,
  diagnostics: {
    metadataRows: sourceMetadataRaw.length,
    sourceMetadataDiagnostics: sourceMetadataNodeJson.diagnostics || {},
  },
};`
);
processCode = processCode.replace(
  "categorySource: categorySegmentSummary.length ? 'statistics/categories' : 'publisher-name-inference',",
  "categorySource: categorySegmentSummary.length ? 'statistics/categories' : 'publisher-name-inference',\n    publisherSourceMetadataRows: sourceMetadataRaw.length,\n    publisherCategoryRecommendationSlides: publisherCategoryRecommendationSlides.length,"
);
processCode = processCode.replace(
  "brandNewPublisherRanking,\n  },",
  "brandNewPublisherRanking,\n    publisherCategoryRecommendationSlides,\n    publisherRecommendationPack,\n  },"
);
processCode = processCode.replace(
  "brandNewPublisherRanking,\n      },",
  "brandNewPublisherRanking,\n        publisherCategoryRecommendationSlides,\n      },"
);
processCode = processCode.replace(
  "brandNewPublisherRanking,\n      diagnostics:",
  "brandNewPublisherRanking,\n      publisherCategorySlides: publisherCategoryRecommendationSlides,\n      publisherRecommendationPack,\n      diagnostics:"
);
processCode = processCode.replace(
  "categorySource: categorySegmentSummary.length ? 'statistics/categories' : 'publisher-name-inference',\n      },",
  "categorySource: categorySegmentSummary.length ? 'statistics/categories' : 'publisher-name-inference',\n        publisherSourceMetadataRows: sourceMetadataRaw.length,\n        publisherSourceMetadataDiagnostics: sourceMetadataNodeJson.diagnostics || {},\n        publisherCategoryRecommendationSlides: publisherCategoryRecommendationSlides.length,\n      },"
);
processNode.parameters.jsCode = processCode;

const buildNode = findNode(workflow, "Build Final Response1");
let buildCode = buildNode.parameters.jsCode;
assertIncludes(buildCode, "const publisherInsights = normalizeList(readFirst(publisherData, [\"publisherInsights\"], []));", "publisher category slides read");
buildCode = buildCode.replace(
  "const publisherInsights = normalizeList(readFirst(publisherData, [\"publisherInsights\"], []));",
  `const publisherInsights = normalizeList(readFirst(publisherData, ["publisherInsights"], []));
const publisherCategorySlides = normalizeList(
  publisherPackData.publisherCategorySlides ||
  publisherPackData.publisherCategoryRecommendationSlides ||
  publisherTables.publisherCategoryRecommendationSlides ||
  readFirst(publisherData, ["publisherCategorySlides"], [])
);
if (publisherCategorySlides.length) {
  publisherTables.publisherCategoryRecommendationSlides = publisherCategorySlides;
}`
);

const oldBlueprintStart = 'const slideBlueprint = [';
const oldBlueprintEnd = '];\n\nconst requestedSlidesRaw';
const start = buildCode.indexOf(oldBlueprintStart);
const end = buildCode.indexOf(oldBlueprintEnd, start);
if (start < 0 || end < 0) throw new Error("Could not find slideBlueprint block");
const dynamicBlueprint = `const coreSlideBlueprint = [
  { key: "cover", title: "Quarterly Business Review Cover" },
  { key: "reporting_overview", title: "Reporting Period Overview" },
  { key: "program_exec_summary", title: "Program Performance Executive Summary" },
  { key: "kpi_volume_conversion", title: "KPI Summary - Volume & Conversion" },
  { key: "kpi_cost_roi", title: "KPI Summary - Cost, CPA & ROI" },
  { key: "kpi_implications", title: "KPI Highlights & Business Implications" },
  { key: "publisher_overview", title: "Publisher Performance Overview" },
  { key: "movers_sales", title: "Movers & Shakers - Sales" },
  { key: "movers_ov", title: "Movers & Shakers - Order Value" },
  { key: "movers_clicks", title: "Movers & Shakers - Clicks" },
  { key: "movers_aov", title: "Movers & Shakers - AOV" },
  { key: "segment_performance", title: "Publisher Segment Performance" },
];

const closingSlideBlueprint = [
  { key: "brand_new_publishers", title: "Brand New Publishers" },
  ...(publisherCategorySlides.length ? [{ key: "publisher_expansion_opportunities", title: "Publisher Expansion Opportunities" }] : []),
  { key: "new_emerging_publishers", title: "New & Emerging Publishers" },
  { key: "recommendations", title: "Strategic Recommendations" },
  { key: "risks_dependencies", title: "Risks & Dependencies" },
  { key: "thank_you", title: "Thank You" },
  { key: "questions_next_steps", title: "Questions & Next Steps" },
];

const slideBlueprint = [
  ...coreSlideBlueprint,
  ...closingSlideBlueprint,
].map((slide, index) => ({ slide: index + 1, ...slide }));

const requestedSlidesRaw`;
buildCode = buildCode.slice(0, start) + dynamicBlueprint + buildCode.slice(end + oldBlueprintEnd.length);
assertIncludes(buildCode, "const targetSlides = Number.isFinite(requestedSlidesNum) && requestedSlidesNum > 0", "target slide calculation");
buildCode = buildCode.replace(
  `const targetSlides = Number.isFinite(requestedSlidesNum) && requestedSlidesNum > 0
  ? Math.min(Math.floor(requestedSlidesNum), slideBlueprint.length)
  : slideBlueprint.length;`,
  `const requestedTargetSlides = Number.isFinite(requestedSlidesNum) && requestedSlidesNum > 0
  ? Math.floor(requestedSlidesNum)
  : slideBlueprint.length;
const targetSlides = publisherCategorySlides.length
  ? slideBlueprint.length
  : Math.min(requestedTargetSlides, slideBlueprint.length);`
);

assertIncludes(buildCode, "const presentonAdditionalInstructions = [", "additional instructions");
buildCode = buildCode.replace(
  '"CONTEXT MODE: stay data-grounded, include concise implications, and provide recommendations only when directly supported by supplied data. Never invent numbers.",',
  `"CONTEXT MODE: stay data-grounded, include concise implications, and provide recommendations only when directly supported by supplied data. Never invent numbers.",
  publisherCategorySlides.length
    ? "Publisher expansion section: use advertiser/sources as gap-analysis data for unconnected publisher prospects. Keep the deck concise with a single Publisher Expansion Opportunities summary slide. The PPTX service will create an Excel workbook with one sheet per Program ID. Each sheet contains Publisher Type, Publisher Name, Source ID, Description, URL, Acceptance Ratio, Accepted Connections, and Rejected Connections, ranked by Accepted Connections then Acceptance Ratio. Do not include sales/order-value/click totals for these unconnected publishers."
    : "",`
);
buildCode = buildCode.replace(
  "publisherTables,\n      languageCode,",
  "publisherTables,\n      publisherCategorySlides,\n      publisherRecommendationPack: publisherPackData.publisherRecommendationPack || {},\n      languageCode,"
);
buildNode.parameters.jsCode = buildCode;

const respondNode = findNode(workflow, "Respond to Webhook");
if (typeof respondNode.parameters.responseBody === "string") {
  const responseBody = respondNode.parameters.responseBody;
  if (!responseBody.includes("excel_url")) {
    assertIncludes(responseBody, "pptx_url: d.pptx_url || d.path || d.download_url || d.file_url || null,", "webhook pptx response");
    respondNode.parameters.responseBody = responseBody.replace(
      "pptx_url: d.pptx_url || d.path || d.download_url || d.file_url || null,\n    file_name: d.file_name || null,",
      "pptx_url: d.pptx_url || d.path || d.download_url || d.file_url || null,\n    excel_url: d.excel_url || d.workbook_url || d.publisher_recommendations_url || null,\n    file_name: d.file_name || null,\n    excel_file_name: d.excel_file_name || null,"
    );
  }
}

fs.writeFileSync(targetPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Created ${targetPath}`);
