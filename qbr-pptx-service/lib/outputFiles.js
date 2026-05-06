const crypto = require("node:crypto");
const path = require("node:path");

function sanitizeOutputFileName(value, fallback = "qbr_deck.pptx") {
  const raw = String(value || fallback).trim() || fallback;
  const withoutPath = path.basename(raw.replace(/[\\/]+/g, path.sep));
  const ext = path.extname(withoutPath).toLowerCase();
  const stem = (ext ? withoutPath.slice(0, -ext.length) : withoutPath)
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const safeStem = stem || path.basename(fallback, path.extname(fallback)) || "qbr_deck";
  return `${safeStem}.pptx`;
}

function appendUuid(fileName, id = crypto.randomUUID()) {
  const ext = path.extname(fileName) || ".pptx";
  const stem = path.basename(fileName, ext);
  return `${stem}_${id}${ext}`;
}

async function writeCreateOnly(fs, outputDir, fileName, data, encoding) {
  let candidate = fileName;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const fullPath = path.join(outputDir, candidate);
    try {
      await fs.writeFile(fullPath, data, { flag: "wx", encoding });
      return { fileName: candidate, fullPath };
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      candidate = appendUuid(fileName);
    }
  }
  throw new Error(`Could not create a unique output file for ${fileName}`);
}

module.exports = {
  sanitizeOutputFileName,
  writeCreateOnly
};
