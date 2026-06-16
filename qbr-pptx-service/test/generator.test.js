const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const JSZip = require("jszip");

process.env.QBR_AUTO_TRANSLATE = "0";

const { generatePresentation } = require("../lib/generator");

function titleOf(line) {
  return String(line || "").split(":")[0].trim();
}

function slideByTitle(deckSpec, title) {
  return deckSpec.slides.find((slide) => slide.title === title);
}

async function openPptx(buffer) {
  return JSZip.loadAsync(buffer);
}

async function fileHash(file) {
  return crypto.createHash("sha256").update(await file.async("nodebuffer")).digest("hex");
}

async function bufferHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function slideRelationshipTargets(relsXml) {
  return Array.from(relsXml.matchAll(/Target="([^"]+)"/g))
    .map(([, target]) => target.replace(/^\.\.\//, "ppt/").replace(/\\/g, "/"));
}

async function embeddedImageHashesForSlide(zip, slideNumber) {
  const relsXml = await zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`).async("string");
  const mediaFiles = slideRelationshipTargets(relsXml)
    .filter((target) => /^ppt\/media\/image-.+\.png$/i.test(target))
    .map((target) => zip.file(target))
    .filter(Boolean);
  return Promise.all(mediaFiles.map(fileHash));
}

function roundRectFrames(slideXml) {
  return Array.from(slideXml.matchAll(/<p:sp[\s\S]*?<\/p:sp>/g))
    .map(([shapeXml]) => {
      if (!/prst="roundRect"/.test(shapeXml)) return null;
      const off = shapeXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const ext = shapeXml.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      if (!off || !ext) return null;
      return {
        x: Number(off[1]),
        y: Number(off[2]),
        w: Number(ext[1]),
        h: Number(ext[2])
      };
    })
    .filter(Boolean);
}

function pictureFrames(slideXml) {
  return Array.from(slideXml.matchAll(/<p:pic[\s\S]*?<\/p:pic>/g))
    .map(([pictureXml]) => {
      const off = pictureXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
      const ext = pictureXml.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      if (!off || !ext) return null;
      return {
        x: Number(off[1]),
        y: Number(off[2]),
        w: Number(ext[1]),
        h: Number(ext[2])
      };
    })
    .filter(Boolean);
}

function emu(inches) {
  return Math.round(inches * 914400);
}

function assertTextUsesColor(slideXml, text, color) {
  const escaped = String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<a:srgbClr val="${color}"[\\s\\S]{0,500}<a:t>${escaped}<\\/a:t>`, "i");
  assert.match(slideXml, pattern);
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

test("advertiser deck omits the standalone sales growth signals slide", async () => {
  const result = await generatePresentation(misleadingHeadingPayload());
  const slide = slideByTitle(result.deckSpec, "Sales Growth Signals");
  assert.equal(slide, undefined);
});

test("advertiser deck omits the standalone sales growth signals slide even with explicit signals", async () => {
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

  assert.equal(slide, undefined);
});

test("advertiser service does not switch to publisher-program template", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    analysisLevel: "publisher_program"
  });

  const titles = result.deckSpec.slides.map((slide) => slide.title);
  assert.ok(titles.includes("Program Performance: Executive Summary"));
  assert.ok(titles.includes("Publisher Performance Overview"));
  assert.ok(titles.includes("Brand New Publishers"));
  assert.ok(!titles.includes("Sales Growth Signals"));
  assert.ok(!titles.includes("Publisher Segment Performance"));
  assert.ok(!titles.includes("Publisher Performance Summary"));
  assert.ok(!titles.includes("Program Level Analysis"));
  assert.ok(!titles.includes("Brand New Programs"));
  assert.ok(!titles.includes("Movers & Shakers - Commission"));
});

test("cover title and client copy use the base program name for multi-program requests", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    client: "HP store BE +7 more + 7 More..",
    analysisProgramIds: ["111", "222"],
    programScopeTable: [
      {
        Program: "HP store BE",
        "Program ID": "111",
        "Current OV": "GBP 120,000",
        "OV YoY %": "+12.0%",
        "Current Sales": "450",
        "Sales YoY %": "+10.0%"
      },
      {
        Program: "HP store UK",
        "Program ID": "222",
        "Current OV": "GBP 95,000",
        "OV YoY %": "-4.0%",
        "Current Sales": "300",
        "Sales YoY %": "-3.0%"
      }
    ]
  });

  const coverSlide = result.deckSpec.slides[0];
  const thankYouSlide = result.deckSpec.slides[result.deckSpec.slides.length - 1];

  assert.equal(coverSlide.title, "HP store Affiliate Program Quarterly Business Review");
  assert.match(coverSlide.summary, /HP store affiliate program/i);
  assert.equal(coverSlide.bullets[0], "Client: HP store");
  assert.equal(thankYouSlide.title, "HP store - Thank you.");
  assert.doesNotMatch(coverSlide.title, /\+7 more|HP store BE|HP store UK/i);
  assert.doesNotMatch(coverSlide.bullets[0], /\+7 more|HP store BE|HP store UK/i);
});

test("program breakdown extracts a market code from the program name when the Market column is missing", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    programScopeTable: [
      {
        Program: "HP store BE",
        "Program ID": "12345",
        Clicks: "10,000",
        Impressions: "100,000",
        Sales: "500",
        "Conversion Rate": "5.00%",
        AOV: "GBP 42.00",
        "Total Order Value": "GBP 21,000",
        "YoY Change": "-12.0%"
      }
    ]
  });

  const programBreakdownSlide = result.deckSpec.slides.find((slide) => slide.id === "kpi-cost-roi");

  assert.ok(programBreakdownSlide);
  assert.equal(programBreakdownSlide.tables[0].columns[1], "Market");
  assert.equal(programBreakdownSlide.tables[0].rows[0][0], "12345");
  assert.equal(programBreakdownSlide.tables[0].rows[0][1], "BE");
});

test("program breakdown prefers the explicit Market value when provided", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    programScopeTable: [
      {
        Program: "HP Store",
        Market: "UK",
        "Program ID": "98765",
        Clicks: "20,000",
        Impressions: "150,000",
        Sales: "900",
        "Conversion Rate": "4.50%",
        AOV: "GBP 55.00",
        "Total Order Value": "GBP 49,500",
        "YoY Change": "+8.0%"
      }
    ]
  });

  const programBreakdownSlide = result.deckSpec.slides.find((slide) => slide.id === "kpi-cost-roi");

  assert.ok(programBreakdownSlide);
  assert.equal(programBreakdownSlide.tables[0].rows[0][1], "UK");
});

test("program breakdown extracts a trailing country name when the Market column is missing", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    programScopeTable: [
      {
        Program: "HP Store Germany",
        "Program ID": "54321",
        Clicks: "15,000",
        Impressions: "120,000",
        Sales: "640",
        "Conversion Rate": "4.27%",
        AOV: "EUR 48.00",
        "Total Order Value": "EUR 30,720",
        "YoY Change": "+6.0%"
      }
    ]
  });

  const programBreakdownSlide = result.deckSpec.slides.find((slide) => slide.id === "kpi-cost-roi");

  assert.ok(programBreakdownSlide);
  assert.equal(programBreakdownSlide.tables[0].rows[0][1], "Germany");
});

test("program KPI tables survive n8n-style request wrappers", async () => {
  const payload = {
    ...misleadingHeadingPayload(),
    client: "HP Store + 7 more + 7 more",
    programScopeTable: [
      {
        "Program ID": "21701",
        Market: "-",
        Clicks: "587,706",
        Impressions: "125",
        Sales: "10,292",
        "Conversion Rate": "1.75%",
        AOV: "GBP 346.37",
        "Total Order Value": "GBP 3,564,791",
        "YoY Change": "-9.4%"
      }
    ]
  };

  const result = await generatePresentation([{ json: payload }]);
  const kpiSlide = result.deckSpec.slides.find((slide) => slide.id === "kpi-volume-conversion");
  const programBreakdownSlide = result.deckSpec.slides.find((slide) => slide.id === "kpi-cost-roi");

  assert.ok(result.normalized.metrics.length > 0);
  assert.equal(result.normalized.metrics[0].current, "1,087,015");
  assert.equal(kpiSlide.tables[0].rows[0][0], "Clicks");
  assert.equal(kpiSlide.tables[0].rows[0][1], "1,087,015");
  assert.equal(programBreakdownSlide.tables[0].rows[0][0], "21701");
  assert.equal(programBreakdownSlide.tables[0].rows[0][2], "587,706");
});

test("advertiser QBR moves segment analysis onto publisher overview and removes segment slide", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      segmentSummary: [
        {
          Segment: "Cashback & Loyalty sites",
          "Total Sales": "1,098",
          "Sales YoY %": "+12.0%",
          "Total OV": "€70,938.76",
          "OV YoY %": "+9.0%"
        },
        {
          Segment: "CSS",
          "Total Sales": "3,299",
          "Sales YoY %": "+15.0%",
          "Total OV": "€164,888.68",
          "OV YoY %": "+11.0%"
        }
      ],
      top10ByOV: [
        {
          Publisher: "CSS Partner",
          Segment: "CSS",
          "Order Value": "€164,888.68"
        }
      ]
    }
  });

  const titles = result.deckSpec.slides.map((slide) => slide.title);
  const overviewSlide = slideByTitle(result.deckSpec, "Publisher Performance Overview");

  assert.ok(overviewSlide);
  assert.equal(overviewSlide.kind, "publisher-overview");
  assert.equal(overviewSlide.analysisTitle, "Segment Breakdown");
  assert.equal(titles[6], "Publisher Performance Overview");
  assert.equal(titles[7], "Top Publisher Performance: Volume & Conversion");
  assert.equal(titles[8], "Movers and Shakers: Publisher Performance");
  assert.ok(!titles.includes("Publisher Segment Performance"));
  assert.ok(overviewSlide.bullets.some((bullet) => /^CSS - \+11\.0% OV YoY/.test(bullet) || /^Cashback & Loyalty sites - \+12\.0% OV YoY/.test(bullet)));
  assert.ok(overviewSlide.bullets.every((bullet) => !/^\[[^\]]+\]\s/.test(bullet)));
  assert.match(overviewSlide.bullets.join(" "), /CSS/i);
  assert.match(overviewSlide.bullets.join(" "), /€164,888\.68 total OV/i);
});

test("segment breakdown prefers top publisher performance rows over the older top-by-OV table", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      segmentSummary: [
        {
          Segment: "Cashback",
          "Total Sales": "1,800",
          "Sales YoY %": "+8.0%",
          "Total OV": "GBP 320,000",
          "OV YoY %": "+6.0%",
          Publishers: "6"
        },
        {
          Segment: "CSS",
          "Total Sales": "900",
          "Sales YoY %": "+12.0%",
          "Total OV": "GBP 210,000",
          "OV YoY %": "+10.0%",
          Publishers: "4"
        }
      ],
      top10ByOV: [
        {
          Publisher: "Old Cashback Leader",
          Segment: "Cashback",
          "Order Value": "GBP 320,000",
          "Current Sales": "1,800"
        },
        {
          Publisher: "Old CSS Leader",
          Segment: "CSS",
          "Order Value": "GBP 210,000",
          "Current Sales": "900"
        }
      ],
      topPublisherPerformance: [
        {
          Publisher: "New Cashback Leader",
          Segment: "Cashback",
          "Total Order Value": "GBP 320,000",
          Sales: "1,800"
        },
        {
          Publisher: "New CSS Leader",
          Segment: "CSS",
          "Total Order Value": "GBP 210,000",
          Sales: "900"
        }
      ]
    }
  });

  const overviewSlide = slideByTitle(result.deckSpec, "Publisher Performance Overview");
  const bulletText = overviewSlide.bullets.join("\n");

  assert.match(bulletText, /New Cashback Leader/);
  assert.match(bulletText, /New CSS Leader/);
  assert.doesNotMatch(bulletText, /Old Cashback Leader/);
  assert.doesNotMatch(bulletText, /Old CSS Leader/);
});

test("publisher overview renders a segment treemap with a structured breakdown table", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      segmentSummary: [
        {
          Segment: "Cashback & Loyalty sites",
          "Total Sales": "1,098",
          "Sales YoY %": "+12.0%",
          "Total OV": "â‚¬70,938.76",
          "OV YoY %": "+9.0%"
        },
        {
          Segment: "CSS",
          "Total Sales": "3,299",
          "Sales YoY %": "+15.0%",
          "Total OV": "â‚¬164,888.68",
          "OV YoY %": "+11.0%"
        }
      ]
    }
  });
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file("ppt/slides/slide7.xml").async("string");
  const overviewSlide = slideByTitle(result.deckSpec, "Publisher Performance Overview");

  assert.equal(overviewSlide.summaryTable.columns.join("|"), "Segment|YoY Growth|Total OV|Sales");
  assert.match(slideXml, /Share of Total by Segment/);
  assert.match(slideXml, /Segment Breakdown/);
  assert.match(slideXml, /YoY Growth/);
  assert.match(slideXml, /Total OV/);
  assert.match(slideXml, /Sales/);
  assert.match(slideXml, /<a:t>70%<\/a:t>/);
  assert.match(slideXml, /<a:srgbClr val="74C8DC"/i);
  assert.doesNotMatch(slideXml, /Key Insights/);
});

test("publisher overview keeps full segment labels and lists all categories in the structured table", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      segmentSummary: [
        {
          Segment: "Cashback & Loyalty sites",
          "Total Sales": "1,098",
          "Sales YoY %": "+12.0%",
          "Total OV": "GBP 70,939",
          "OV YoY %": "+9.0%",
          Publishers: "12"
        },
        {
          Segment: "Discount & Voucher Code Sites",
          "Total Sales": "850",
          "Sales YoY %": "-6.7%",
          "Total OV": "GBP 58,352",
          "OV YoY %": "-6.7%",
          Publishers: "9"
        },
        {
          Segment: "CSS",
          "Total Sales": "3,213",
          "Sales YoY %": "+10.7%",
          "Total OV": "GBP 792,138",
          "OV YoY %": "+29.6%",
          Publishers: "5"
        },
        {
          Segment: "Closed User Groups",
          "Total Sales": "2,401",
          "Sales YoY %": "-18.0%",
          "Total OV": "GBP 683,220",
          "OV YoY %": "-29.2%",
          Publishers: "7"
        },
        {
          Segment: "Subnetworks",
          "Total Sales": "1,412",
          "Sales YoY %": "+4.1%",
          "Total OV": "GBP 522,440",
          "OV YoY %": "+12.0%",
          Publishers: "6"
        },
        {
          Segment: "Display Advertising",
          "Total Sales": "1,095",
          "Sales YoY %": "-11.5%",
          "Total OV": "GBP 519,228",
          "OV YoY %": "-14.2%",
          Publishers: "4"
        },
        {
          Segment: "Content",
          "Total Sales": "1,089",
          "Sales YoY %": "-40.0%",
          "Total OV": "GBP 588,352",
          "OV YoY %": "-19.7%",
          Publishers: "8"
        }
      ]
    }
  });

  const overviewSlide = slideByTitle(result.deckSpec, "Publisher Performance Overview");
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file("ppt/slides/slide7.xml").async("string");
  const tableRows = overviewSlide.summaryTable.rows.map((row) => row.join(" | ")).join("\n");

  assert.ok(overviewSlide);
  assert.equal(overviewSlide.summaryTable.rows.length, 7);
  assert.match(tableRows, /Subnetworks \| \+12\.0% \| GBP 522,440 \| 1,412/);
  assert.match(tableRows, /Display Advertising \| -14\.2% \| GBP 519,228 \| 1,095/);
  assert.match(slideXml, /Cashback &amp; Loyalty sites/);
  assert.match(slideXml, /Discount &amp; Voucher Code Sites/);
  assert.doesNotMatch(slideXml, /Key Insights/);
});

test("publisher overview omits zero-value categories from the segment breakdown table", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      segmentSummary: [
        {
          Segment: "Cashback & Loyalty sites",
          "Total Sales": "1,098",
          "Sales YoY %": "+12.0%",
          "Total OV": "GBP 70,939",
          "OV YoY %": "+9.0%"
        },
        {
          Segment: "Paid search",
          "Total Sales": "0",
          "Sales YoY %": "N/A",
          "Total OV": "GBP 0",
          "OV YoY %": "N/A"
        },
        {
          Segment: "Email Marketing",
          "Total Sales": "0",
          "Sales YoY %": "N/A",
          "Total OV": "£0",
          "OV YoY %": "N/A"
        }
      ]
    }
  });

  const overviewSlide = slideByTitle(result.deckSpec, "Publisher Performance Overview");
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file("ppt/slides/slide7.xml").async("string");
  const tableRows = overviewSlide.summaryTable.rows.map((row) => row.join(" | ")).join("\n");

  assert.equal(overviewSlide.summaryTable.rows.length, 1);
  assert.match(tableRows, /Cashback & Loyalty sites \| \+9\.0% \| GBP 70,939 \| 1,098/);
  assert.doesNotMatch(tableRows, /Paid search/i);
  assert.doesNotMatch(tableRows, /Email Marketing/i);
  assert.doesNotMatch(slideXml, /Paid search/i);
  assert.doesNotMatch(slideXml, /Email Marketing/i);
});

test("advertiser QBR inserts top publisher performance table before publisher movers chart", async () => {
  const publisherRows = Array.from({ length: 12 }, (_, index) => {
    const rank = index + 1;
    return {
      Publisher: `Publisher ${rank}`,
      "Site ID": `site-${rank}`,
      Segment: rank % 2 ? "Voucher" : "Content",
      "Order Value": `â‚¬${rank * 1000000}`,
      "Current Sales": String(rank * 10)
    };
  });

  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      segmentSummary: [
        {
          Segment: "Voucher",
          "Total Sales": "120",
          "Sales YoY %": "+10.0%",
          "Total OV": "â‚¬78,000,000",
          "OV YoY %": "+10.0%",
          Publishers: "12"
        }
      ],
      top10ByOV: publisherRows,
      topPublisherPerformance: [
        {
          Publisher: "Publisher 12",
          "Site ID": "site-12",
          Clicks: "12,000",
          Impressions: "120,000",
          Sales: "120",
          "Conversion Rate": "1.00%",
          AOV: "Ã¢â€šÂ¬100.00",
          "Total Order Value": "Ã¢â€šÂ¬12,000,000",
          "YoY Change": "+20.0%"
        }
      ]
    }
  });

  const titles = result.deckSpec.slides.map((slide) => slide.title);
  const topPublisherSlide = result.deckSpec.slides[7];
  const rankingSlide = result.deckSpec.slides[8];

  assert.equal(titles[6], "Publisher Performance Overview");
  assert.equal(topPublisherSlide.kind, "program-breakdown");
  assert.equal(topPublisherSlide.title, "Top Publisher Performance: Volume & Conversion");
  assert.equal(topPublisherSlide.tables[0].columns[0], "Publisher");
  assert.ok(!topPublisherSlide.tables[0].columns.includes("Impressions"));
  assert.equal(topPublisherSlide.tables[0].rows[0][0], "Publisher 12");
  assert.equal(topPublisherSlide.tables[0].rows[0][7], "+20.0%");
  assert.equal(rankingSlide.kind, "publisher-ov-ranking-bars");
  assert.equal(rankingSlide.title, "Movers and Shakers: Publisher Performance");
  assert.equal(rankingSlide.ranking.top.length, 10);
  assert.equal(rankingSlide.ranking.bottom.length, 10);
  assert.equal(rankingSlide.ranking.top[0].publisher, "Publisher 12");
  assert.equal(rankingSlide.ranking.bottom[0].publisher, "Publisher 1");
});

test("advertiser QBR falls back to top10ByOV for top publisher performance table", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      segmentSummary: [
        {
          Segment: "Voucher",
          "Total Sales": "120",
          "Sales YoY %": "+10.0%",
          "Total OV": "Ã¢â€šÂ¬78,000,000",
          "OV YoY %": "+10.0%",
          Publishers: "12"
        }
      ],
      top10ByOV: [
        {
          Publisher: "Fallback Publisher",
          "Site ID": "site-fallback",
          Clicks: "12,000",
          Impressions: "120,000",
          "Current Sales": "120",
          "Conversion Rate": "1.00%",
          AOV: "ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬100.00",
          "Order Value": "ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬12,000,000",
          "OV YoY %": "+20.0%"
        }
      ]
    }
  });

  const topPublisherSlide = result.deckSpec.slides[7];

  assert.equal(topPublisherSlide.title, "Top Publisher Performance: Volume & Conversion");
  assert.ok(!topPublisherSlide.tables[0].columns.includes("Impressions"));
  assert.equal(topPublisherSlide.tables[0].rows[0][0], "Fallback Publisher");
  assert.equal(topPublisherSlide.tables[0].rows[0][1], "site-fallback");
  assert.equal(topPublisherSlide.tables[0].rows[0][7], "+20.0%");
});

test("advertiser QBR uses explicit publisher best and worst order-value rankings when supplied", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      top10ByOV: [
        { Publisher: "Fallback Top", "Order Value": "€999" }
      ]
    },
    publisherOrderValueRanking: {
      top: [
        { publisher: "Explicit Best", siteId: "best-1", value: 500000, label: "€500k" }
      ],
      bottom: [
        { publisher: "Explicit Decline", siteId: "decline-1", value: -100000, label: "-€100k" }
      ],
      sourceCount: 22
    }
  });

  const rankingSlide = result.deckSpec.slides.find((slide) => slide.id === "publisher-order-value-rankings");

  assert.ok(rankingSlide);
  assert.equal(rankingSlide.ranking.top[0].publisher, "Explicit Best");
  assert.equal(rankingSlide.ranking.bottom[0].publisher, "Explicit Decline");
  assert.equal(rankingSlide.ranking.bottom[0].label, "-€100k");
  assert.equal(rankingSlide.ranking.sourceCount, 22);
  assert.equal(rankingSlide.panelTitles.top, "Top 10 YoY OV growth publishers");
  assert.equal(rankingSlide.panelTitles.bottom, "Top 10 YoY OV decline publishers");
  assert.match(rankingSlide.subtitle, /YoY order value movement/i);
});

test("advertiser Brand New Publishers slide uses order-value bar chart and removes table", async () => {
  const brandNewRows = Array.from({ length: 12 }, (_, index) => {
    const rank = index + 1;
    return {
      Publisher: `New Publisher ${rank}`,
      "Site ID": `new-${rank}`,
      Segment: rank % 2 ? "Cashback" : "Content",
      "Current OV": `â‚¬${rank * 750}`,
      "Current Sales": String(rank)
    };
  });

  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    currencyCode: "GBP",
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      brandNewTop: brandNewRows
    }
  });

  const brandNewSlide = result.deckSpec.slides.find((slide) => slide.id === "brand-new-publishers");

  assert.ok(brandNewSlide);
  assert.equal(brandNewSlide.title, "Brand New Publishers");
  assert.equal(brandNewSlide.kind, "publisher-ov-ranking-bars");
  assert.deepEqual(brandNewSlide.tables, []);
  assert.equal(brandNewSlide.ranking.top.length, 10);
  assert.equal(brandNewSlide.ranking.bottom.length, 2);
  assert.equal(brandNewSlide.ranking.top[0].publisher, "New Publisher 12");
  assert.equal(brandNewSlide.ranking.bottom[0].publisher, "New Publisher 1");
  assert.equal(brandNewSlide.ranking.top[0].label, "£9,000");
  assert.equal(brandNewSlide.panelTitles.top, "Highest order value new publishers");
  assert.equal(brandNewSlide.panelTitles.bottom, "Lower order value new publishers");
  assert.equal(brandNewSlide.hideEmptyBottomPanel, true);
  assert.ok(!brandNewSlide.ranking.top.some((row) => brandNewSlide.ranking.bottom.some((bottom) => bottom.publisher === row.publisher)));
});

test("advertiser Brand New Publishers slide uses explicit top and lowest new-publisher rankings when supplied", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      brandNewTop: [
        { Publisher: "Fallback New", "Current OV": "€999" }
      ]
    },
    brandNewPublisherRanking: {
      top: [
        { publisher: "Best New", siteId: "new-best", value: 7000, label: "€7k" }
      ],
      bottom: [
        { publisher: "Lowest New", siteId: "new-low", value: 25, label: "€25" }
      ],
      sourceCount: 14
    }
  });

  const brandNewSlide = result.deckSpec.slides.find((slide) => slide.id === "brand-new-publishers");

  assert.ok(brandNewSlide);
  assert.equal(brandNewSlide.ranking.top[0].publisher, "Best New");
  assert.equal(brandNewSlide.ranking.bottom[0].publisher, "Lowest New");
  assert.equal(brandNewSlide.ranking.sourceCount, 14);
});

test("advertiser Brand New Publishers uses a single panel when there is no distinct lower cohort", async () => {
  const brandNewRows = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return {
      Publisher: `Only Publisher ${rank}`,
      "Site ID": `only-${rank}`,
      "Current OV": `GBP ${rank * 1000}`
    };
  });

  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    currencyCode: "GBP",
    publisherTables: {
      ...misleadingHeadingPayload().publisherTables,
      brandNewTop: brandNewRows
    }
  });

  const brandNewSlide = result.deckSpec.slides.find((slide) => slide.id === "brand-new-publishers");
  const brandNewSlideNumber = result.deckSpec.slides.findIndex((slide) => slide.id === "brand-new-publishers") + 1;
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file(`ppt/slides/slide${brandNewSlideNumber}.xml`).async("string");

  assert.ok(brandNewSlide);
  assert.equal(brandNewSlide.ranking.top.length, 10);
  assert.equal(brandNewSlide.ranking.bottom.length, 0);
  assert.match(slideXml, /Highest order value new publishers/);
  assert.doesNotMatch(slideXml, /Lower order value new publishers/);
  assert.match(slideXml, /£10,000|Â£10,000/);
});

test("advertiser publisher recommendations render as one deck summary and one-sheet workbook", async () => {
  const contentPublishers = Array.from({ length: 12 }, (_, index) => ({
    "Publisher Name": `Content Prospect ${index + 1}`,
    "Source ID": `content-${index + 1}`,
    "Promotion Type": "Content",
    Description: `Editorial and review publisher ${index + 1}`,
    URL: `https://content-${index + 1}.example.com`,
    "Total Connections": String(100 - index),
    "Acceptance Ratio": `${90 - index}%`,
    "Accepted Connections": String(50 - index),
    "Rejected Connections": String(index)
  }));

  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherCategorySlides: [
      {
        category: "Content",
        recommendation: "Review the top 10 unconnected Content publishers.",
        evidence: ["12 reviewable publisher source(s)", "1,140 total connection signal(s)"],
        recommendedPublishers: contentPublishers
      },
      {
        category: "Price Comparison",
        recommendation: "Review high-fit price comparison opportunities.",
        evidence: ["3 reviewable publisher source(s)"],
        recommendedPublishers: [
          {
            "Publisher Name": "Compare Prospect",
            "Source ID": "compare-101",
            "Promotion Type": "Price Comparison",
            Description: "Comparison engine for category-led shopping.",
            URL: "https://compare.example.com",
            "Total Connections": "77",
            "Acceptance Ratio": "88%",
            "Accepted Connections": "77",
            "Rejected Connections": "5"
          }
        ]
      }
    ]
  });

  const summarySlide = result.deckSpec.slides.find((slide) => slide.id === "publisher-expansion-opportunities");
  const categorySlides = result.deckSpec.slides.filter((slide) => /^publisher-recommendations-/.test(slide.id));

  assert.ok(summarySlide);
  assert.equal(categorySlides.length, 0);
  assert.equal(summarySlide.kind, "publisher-table");
  assert.equal(summarySlide.title, "Publisher Expansion Opportunities");
  assert.deepEqual(summarySlide.tables[0].columns, [
    "Publisher Type",
    "Publishers",
    "Accepted Connections",
    "Avg Acceptance Ratio"
  ]);
  assert.deepEqual(summarySlide.tables[0].rows[0], ["Content", "12", "534", "84.5%"]);
  assert.match(summarySlide.callout, /Excel workbook/i);

  assert.ok(Buffer.isBuffer(result.excelBuffer));
  assert.equal(result.excelFileName, "qbr_deck_publisher_recommendations.xlsx");

  const workbook = await JSZip.loadAsync(result.excelBuffer);
  const sheetXml = await workbook.file("xl/worksheets/sheet1.xml").async("string");
  const sharedStrings = await workbook.file("xl/sharedStrings.xml").async("string");
  const decodedSheet = sheetXml.replace(/<v>(\d+)<\/v>/g, (_match, index) => {
    const strings = Array.from(sharedStrings.matchAll(/<si><t[^>]*>(.*?)<\/t><\/si>/g)).map(([, value]) => value);
    return strings[Number(index)] || "";
  });

  [
    "Program ID",
    "Publisher Type",
    "Publisher Name",
    "Source ID",
    "Description",
    "URL",
    "Acceptance Ratio",
    "Accepted Connections",
    "Rejected Connections",
    "Compare Prospect",
    "compare-101",
    "Content Prospect 1"
  ].forEach((text) => assert.match(decodedSheet, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.ok(decodedSheet.indexOf("Compare Prospect") < decodedSheet.indexOf("Content Prospect 1"));
});

test("advertiser publisher recommendation workbook separates multi-program rows by program ID", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    publisherProgramIds: ["327928", "123456"],
    publisherCategorySlides: [
      {
        programId: "327928",
        category: "Content",
        recommendedPublishers: [
          {
            "Publisher Name": "Program A Publisher",
            "Source ID": "source-a",
            "Program ID": "327928",
            "Promotion Type": "Content",
            Description: "Publisher for first submitted program.",
            URL: "https://program-a.example.com",
            "Acceptance Ratio": "91%",
            "Accepted Connections": "20",
            "Rejected Connections": "2"
          }
        ]
      },
      {
        programId: "123456",
        category: "Cashback",
        recommendedPublishers: [
          {
            "Publisher Name": "Program B Publisher",
            "Source ID": "source-b",
            "Program ID": "123456",
            "Promotion Type": "Cashback",
            Description: "Publisher for second submitted program.",
            URL: "https://program-b.example.com",
            "Acceptance Ratio": "87%",
            "Accepted Connections": "30",
            "Rejected Connections": "4"
          }
        ]
      }
    ]
  });

  const workbook = await JSZip.loadAsync(result.excelBuffer);
  const workbookXml = await workbook.file("xl/workbook.xml").async("string");
  const sheet1Xml = await workbook.file("xl/worksheets/sheet1.xml").async("string");
  const sheet2Xml = await workbook.file("xl/worksheets/sheet2.xml").async("string");
  const sharedStrings = await workbook.file("xl/sharedStrings.xml").async("string");
  const strings = Array.from(sharedStrings.matchAll(/<si><t[^>]*>(.*?)<\/t><\/si>/g)).map(([, value]) => value);
  const decode = (xml) => xml.replace(/<v>(\d+)<\/v>/g, (_match, index) => strings[Number(index)] || "");

  assert.match(workbookXml, /name="327928"/);
  assert.match(workbookXml, /name="123456"/);
  const decodedSheets = [decode(sheet1Xml), decode(sheet2Xml)];
  const programASheet = decodedSheets.find((sheet) => /Program A Publisher/.test(sheet));
  const programBSheet = decodedSheets.find((sheet) => /Program B Publisher/.test(sheet));
  assert.ok(programASheet);
  assert.ok(programBSheet);
  assert.match(programASheet, /Program ID/);
  assert.match(programASheet, /327928/);
  assert.match(programBSheet, /123456/);
  assert.doesNotMatch(programASheet, /Program B Publisher/);
  assert.doesNotMatch(programBSheet, /Program A Publisher/);
});

test("cover slide renders the TD logo as the white image asset", async () => {
  const logoPath = path.join(__dirname, "..", "assets", "td-logo-white.png");
  const expectedLogoHash = await bufferHash(await fs.readFile(logoPath));
  const result = await generatePresentation(misleadingHeadingPayload());
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file("ppt/slides/slide1.xml").async("string");
  const mediaHashes = await embeddedImageHashesForSlide(zip, 1);

  assert.doesNotMatch(slideXml, /<a:t>td<\/a:t>/i);
  assert.doesNotMatch(slideXml, /<a:t>tradedoubler<\/a:t>/i);
  assert.ok(mediaHashes.includes(expectedLogoHash), "expected slide 1 to embed the white TD logo asset");
});

test("cover and thank-you slides use the cyan fifth-element wireframe asset", async () => {
  const wireframePath = path.join(__dirname, "..", "assets", "fifth-element-wireframe-cyan.png");
  const expectedWireframeHash = await bufferHash(await fs.readFile(wireframePath));
  const result = await generatePresentation(misleadingHeadingPayload());
  const zip = await openPptx(result.buffer);
  const finalSlideNumber = result.deckSpec.slides.length;
  const coverXml = await zip.file("ppt/slides/slide1.xml").async("string");
  const finalXml = await zip.file(`ppt/slides/slide${finalSlideNumber}.xml`).async("string");

  const coverHashes = await embeddedImageHashesForSlide(zip, 1);
  const finalHashes = await embeddedImageHashesForSlide(zip, finalSlideNumber);
  const coverWireframeFrame = pictureFrames(coverXml)
    .find((frame) => frame.x > emu(8) && frame.y > emu(2) && frame.w > emu(4) && frame.w < emu(5));
  const finalWireframeFrame = pictureFrames(finalXml)
    .find((frame) => frame.x > emu(6.4) && frame.y > emu(0.6) && frame.w > emu(5.5) && frame.w < emu(6.5));

  assert.ok(coverHashes.includes(expectedWireframeHash), "expected slide 1 to embed the cyan wireframe asset");
  assert.ok(finalHashes.includes(expectedWireframeHash), "expected final slide to embed the cyan wireframe asset");
  assert.ok(coverWireframeFrame, "expected slide 1 wireframe to sit on the right side of the slide");
  assert.ok(finalWireframeFrame, "expected final slide wireframe to be reduced and right aligned");
});

test("KPI summary tiles use the requested language for comparison text", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    languageCode: "DE",
    languageName: "German"
  });
  const slide = result.deckSpec.slides.find((item) => item.kind === "program-executive-summary");
  assert.ok(slide, "expected an executive summary slide");

  const summaries = slide.kpis.map((kpi) => kpi.summary).join("\n");
  assert.match(summaries, /ggü\./);
  assert.match(summaries, /\bVJ\b/);
  assert.doesNotMatch(summaries, /\bPY\b/);
});

test("KPI summary tile deltas render with RAG colors", async () => {
  const result = await generatePresentation(misleadingHeadingPayload());
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file("ppt/slides/slide3.xml").async("string");

  assertTextUsesColor(slideXml, "+8.2%", "57A66C");
  assertTextUsesColor(slideXml, "-13.8%", "EB5757");
});

test("slide 4 and slide 5 signed percentage values render with RAG colors", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    programScopeTable: [
      {
        "Program ID": "12345",
        Market: "AT",
        Clicks: "10,000",
        Impressions: "100,000",
        Sales: "500",
        "Conversion Rate": "5.0%",
        AOV: "€42.00",
        "Total Order Value": "€21,000",
        "YoY Change": "-12.0%"
      }
    ]
  });
  const zip = await openPptx(result.buffer);
  const slide4Xml = await zip.file("ppt/slides/slide4.xml").async("string");
  const slide5Xml = await zip.file("ppt/slides/slide5.xml").async("string");

  assertTextUsesColor(slide4Xml, "+9.3%", "57A66C");
  assertTextUsesColor(slide4Xml, "-13.8%", "EB5757");
  assertTextUsesColor(slide5Xml, "-12.0%", "EB5757");
});

test("thank-you question bubble is compact and positioned on the left", async () => {
  const result = await generatePresentation(misleadingHeadingPayload());
  const zip = await openPptx(result.buffer);
  const finalSlideNumber = result.deckSpec.slides.length;
  const slideXml = await zip.file(`ppt/slides/slide${finalSlideNumber}.xml`).async("string");
  const bubbleFrame = roundRectFrames(slideXml).find((frame) => frame.y > 2000000 && frame.y < 4000000);

  assert.ok(bubbleFrame, "expected a rounded question bubble on the final slide");
  assert.ok(bubbleFrame.x < 1000000, "expected the question bubble to start on the left side");
  assert.ok(bubbleFrame.w < 6500000, "expected the question bubble to stay compact, not span the slide");
});

test("cover metadata renders as open typography instead of rounded badge bars", async () => {
  const result = await generatePresentation(misleadingHeadingPayload());
  const zip = await openPptx(result.buffer);
  const slideXml = await zip.file("ppt/slides/slide1.xml").async("string");

  assert.match(slideXml, /<a:t>QBR REPORT<\/a:t>/i);
  assert.match(slideXml, /<a:t>Jan 2026/);
  assert.match(slideXml, /<a:t>Analysis<\/a:t>/);
  assert.doesNotMatch(slideXml, /prst="roundRect"/);
  assert.doesNotMatch(slideXml, /80D4FF/i);
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
