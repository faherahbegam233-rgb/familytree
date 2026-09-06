// One-off extraction script: pulls the exact verified data (P/A/Aunions/K/Kunions/M/Munions)
// straight out of the source-of-truth HTML file's data block (lines 332-693), so the seed
// data can never drift from what's been pixel-verified against the PDF.
// Run with: node extract-data.mjs
import { readFileSync, writeFileSync } from "fs";

const lines = readFileSync("/home/claude/family-tree-preview.html", "utf8").split("\n");
// 1-indexed line numbers from the grep above -> 0-indexed slice, inclusive of line 693.
const dataBlock = lines.slice(331, 693).join("\n");

if (!dataBlock.includes("function P(") || !dataBlock.includes("var Munions")) {
  throw new Error("Line range no longer matches expected data block — re-check line numbers.");
}

const grabber = new Function(
  dataBlock + `
  return { A, Aunions, K, Kunions, M, Munions };
  `
);
const { A, Aunions, K, Kunions, M, Munions } = grabber();

const out = { A, Aunions, K, Kunions, M, Munions };
writeFileSync(
  new URL("./tree-data.json", import.meta.url),
  JSON.stringify(out, null, 2)
);
console.log("Wrote supabase/tree-data.json");
console.log(
  "Counts:",
  "A=" + Object.keys(A).length,
  "K=" + Object.keys(K).length,
  "M=" + Object.keys(M).length,
  "Aunions=" + Aunions.length,
  "Kunions=" + Kunions.length,
  "Munions=" + Munions.length
);
