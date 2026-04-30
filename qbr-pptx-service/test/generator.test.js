const assert = require("node:assert/strict");
const test = require("node:test");

process.env.QBR_AUTO_TRANSLATE = "0";

const { generatePresentation } = require("../lib/generator");

function titleOf(line) {
  return String(line || "").split(":")[0].trim();
}

function slideByTitle(deckSpec, title) {
  return deckSpec.slides.find((slide) => slide.title === title);
}

function misleadingHeadingPayload() {
  return {
    client: "Heading Validation",
    deckTitle: "QBR - Heading Validation",
    outputFileName: "heading-validation.pptx",
    fullContent: true,
    includeAppendix: false,
    languageCode: "EN",
    currencyCode: "EUR",
    reportingPeriod: "2026-01-01 to 2026-03-31",
    comparisonPeriod: "2025-01-01 to 2025-03-31",
    programOutput: "## KPI Snapshot\n- Conversion and cost efficiency shifted materially.",
    programYoYTable: [
      {
        Row: "Recent",
        Clicks: "1,087,015",
        Sales: "21,234",
        "Conv Rate": "2.08%",
        "Order value": "€9,800,000",
        AOV: "€460.07",
        "Publ Commission": "€289,221",
        CPA: "€13.62",
        ROI: "33.79"
      },
      {
        Row: "Previous",
        Clicks: "1,000,000",
        Sales: "24,637",
        "Conv Rate": "2.63%",
        "Order value": "€10,502,002",
        AOV: "€425.03",
        "Publ Commission": "€378,250",
        CPA: "€15.35",
        ROI: "27.69"
      },
      {
        Row: "Difference",
        Clicks: "+87,015",
        Sales: "-3,403",
        "Conv Rate": "-0.55%",
        "Order value": "-€702,002",
        AOV: "+€35.04",
        "Publ Commission": "-€89,029",
        CPA: "-€1.73",
        ROI: "+6.10"
      },
      {
        Row: "% Variance",
        Clicks: "+9.3%",
        Sales: "-13.8%",
        "Conv Rate": "-21.1%",
        "Order value": "-6.7%",
        AOV: "+8.2%",
        "Publ Commission": "-23.5%",
        CPA: "-11.3%",
        ROI: "+22.0%"
      }
    ],
    publisherTables: {
      segmentSummary: [
        {
          Segment: "Voucher",
          "Total Sales": "2,540",
          "Sales YoY %": "-49.4%",
          "Total OV": "€146,303",
          "OV YoY %": "-61.0%",
          Publishers: "9"
        },
        {
          Segment: "Cashback",
          "Total Sales": "28,973",
          "Sales YoY %": "-26.7%",
          "Total OV": "€33,234,843",
          "OV YoY %": "-26.7%",
          Publishers: "14"
        }
      ],
      top10Increase: [
        {
          Publisher: "FreizeitparkDeals",
          Segment: "Voucher",
          "Current Sales": "2,782",
          "Sales YoY %": "+365.2%",
          "Current OV": "€146,303",
          "OV YoY Change": "+€146,303",
          "OV YoY %": "+53.1%"
        }
      ],
      top10Decrease: [
        {
          Publisher: "Parc de Paris FR",
          Segment: "Voucher",
          "Current Sales": "900",
          "Sales YoY %": "-52.0%",
          "Current OV": "€91,000",
          "OV YoY Change": "-€105,000",
          "OV YoY %": "-43.6%"
        },
        {
          Publisher: "Topvakantiedeal.nl",
          Segment: "Voucher",
          "Current Sales": "16",
          "Sales YoY %": "-99.8%",
          "Current OV": "€4,100",
          "OV YoY Change": "-€120,000",
          "OV YoY %": "-99.8%"
        }
      ],
      top10ByOV: [
        {
          Publisher: "TopCashBack",
          Segment: "Cashback",
          "Order Value": "€18,000,000",
          "Current Sales": "23,018",
          "Sales YoY %": "-20.1%",
          "OV YoY %": "-24.0%"
        },
        {
          Publisher: "Quidco [UK]",
          Segment: "Cashback",
          "Order Value": "€8,000,000",
          "Current Sales": "5,955",
          "Sales YoY %": "-40.0%",
          "OV YoY %": "-39.0%"
        }
      ],
      moversShakersAOV: [
        {
          Publisher: "Extrabu GB",
          Direction: "Up",
          "YoY Change": "€3,353.06",
          "YoY %": "+1094.4%"
        },
        {
          Publisher: "Shopbuddies.be",
          Direction: "Up",
          "YoY Change": "€2,579.19",
          "YoY %": "+312.0%"
        }
      ],
      moversShakersClicks: [
        {
          Publisher: "Topvakantiedeal.nl",
          Direction: "Down",
          "YoY Change": "-790,178",
          "YoY %": "-99.8%"
        },
        {
          Publisher: "Parc de Paris FR",
          Direction: "Down",
          "YoY Change": "-383,364",
          "YoY %": "-43.6%"
        }
      ]
    }
  };
}

test("fallback KPI headings reflect metric direction", async () => {
  const result = await generatePresentation(misleadingHeadingPayload());
  const slide = slideByTitle(result.deckSpec, "KPI Highlights & Business Implications");
  assert.ok(slide, "expected KPI highlights slide");

  const titles = slide.bullets.slice(0, 5).map(titleOf);
  assert.equal(titles[0], "Conversion Rate Pressure");
  assert.equal(titles[3], "CPA Efficiency Improved");
  assert.equal(titles[4], "ROI Improved");
  assert.ok(!titles.includes("Conversion Rate Improvement"));
  assert.ok(!titles.includes("Rising CPA"));
  assert.match(slide.bullets[3], /lower acquisition cost/i);
  assert.doesNotMatch(slide.bullets[3], /higher acquisition cost/i);
});

test("messy KPI highlight table rows do not override validated generated headings", async () => {
  const payload = misleadingHeadingPayload();
  payload.publisherTables.kpiHighlights = [
    {
      Highlight: "Total/Publisher Commission: €289,246 (Previous: €378,275 | Difference: -€89,029 | % Variance: -23.5%); CPA: €13.62 (Previous: €15.35 | Difference: -€1.73 | % Variance: -11.3%); ROI: 33.79 (Previous: 27.69 | Difference: 6.10 | % Variance: +22.0%)"
    },
    {
      Highlight: "Sales Volume Pressure: Clicks increased by 87,015 (+9.3%) to 1,022,645 while Sales decreased by 3,403 (-13.8%) to 21,242."
    },
    {
      Highlight: "Conversion Rate declined from 2.63% to 2.08% (Difference: -0.56% | % Variance: -21.1%)."
    },
    {
      Highlight: "AOV Growth Partially Offsetting Volume Decline: Order value decreased by €702,002 (-6.7%) to €9,772,811 while AOV rose by €35.04 (+8.2%) to €460.07."
    },
    {
      Highlight: "Rising CPA: Total/Publisher Commission fell by €89,029 (-23.5%) to €289,246; CPA decreased by €1.73 (-11.3%) to €13.62; ROI increased by 6.10 (+22.0%) to 33.79."
    }
  ];

  const result = await generatePresentation(payload);
  const slide = slideByTitle(result.deckSpec, "KPI Highlights & Business Implications");
  const titles = slide.bullets.slice(0, 5).map(titleOf);

  assert.deepEqual(titles, [
    "Conversion Rate Pressure",
    "Sales Volume Pressure",
    "AOV Growth Partially Offsetting Sales Decline",
    "CPA Efficiency Improved",
    "ROI Improved"
  ]);
  assert.doesNotMatch(slide.bullets.join("\n"), /Total\/Publisher Commission/i);
  assert.doesNotMatch(slide.bullets.join("\n"), /Rising CPA/i);
});

test("fallback sales growth signal headings do not contradict the data", async () => {
  const result = await generatePresentation(misleadingHeadingPayload());
  const slide = slideByTitle(result.deckSpec, "Sales Growth Signals");
  assert.ok(slide, "expected sales growth signals slide");

  const titles = slide.signals.map((signal) => signal.title);
  assert.match(titles[0], /Voucher Segment Declined/i);
  assert.equal(titles[4], "Publisher-Level Click Declines Within Overall Click Growth");
  assert.ok(!titles.includes("Voucher Segment: Highest YoY Sales Growth"));
  assert.ok(!titles.includes("Click Volume Decline Concentrated in Two Publishers"));
  assert.doesNotMatch(slide.signals[4].detail, /total click loss/i);
  assert.match(slide.signals[4].detail, /despite overall click growth/i);
});

test("explicit AI sales growth signal titles are preserved", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    salesGrowthSignals: [
      {
        title: "AI Analysis: Voucher Weakness Is Masked by One Publisher",
        detail: "The title and body are supplied by upstream analysis."
      }
    ]
  });
  const slide = slideByTitle(result.deckSpec, "Sales Growth Signals");

  assert.equal(slide.signals[0].title, "AI Analysis: Voucher Weakness Is Masked by One Publisher");
  assert.equal(slide.signals[0].detail, "The title and body are supplied by upstream analysis.");
});

test("Polish reporting-period labels render with Unicode characters", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    languageCode: "PL",
    languageName: "Polish"
  });

  const labels = result.deckSpec.metadata.uiLabels;
  assert.equal(labels.currentPeriod, "Bieżący okres");
  assert.equal(labels.comparisonPeriodYoy, "Okres porównawczy (r/r)");
  assert.equal(labels.dataAsOfPrefix, "Dane na dzień");
  assert.match(labels.allFiguresStatement, /Wszystkie wartości/);
  assert.match(labels.allFiguresStatement, /bieżący okres względem okresu porównawczego/);

  const visiblePolishLabels = Object.values(labels).join("\n");
  assert.doesNotMatch(visiblePolishLabels, /(?:Ã|Å|Ä|Â)/);
});

test("mojibake payload text is repaired before deck generation", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    client: "BieÅ¼Ä…cy klient",
    deckTitle: "QBR - BieÅ¼Ä…cy klient"
  });

  assert.equal(result.normalized.client, "Bieżący klient");
  assert.equal(result.deckSpec.metadata.client, "Bieżący klient");
  assert.equal(result.deckSpec.metadata.deckTitle, "QBR - Bieżący klient");
});
