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

test("advertiser service does not switch to publisher-program template", async () => {
  const result = await generatePresentation({
    ...misleadingHeadingPayload(),
    analysisLevel: "publisher_program"
  });

  const titles = result.deckSpec.slides.map((slide) => slide.title);
  assert.ok(titles.includes("Program Performance: Executive Summary"));
  assert.ok(titles.includes("Publisher Performance Overview"));
  assert.ok(titles.includes("Brand New Publishers"));
  assert.ok(!titles.includes("Publisher Performance Summary"));
  assert.ok(!titles.includes("Program Level Analysis"));
  assert.ok(!titles.includes("Brand New Programs"));
  assert.ok(!titles.includes("Movers & Shakers - Commission"));
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
