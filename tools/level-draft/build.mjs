// Builds a level draft page: the draft source with today's geometry pasted in
// where it says __GEO__ (docs/content-zone-design-guide.md, "Every zone plan has
// a draft map").
//
//   node tools/level-draft/build.mjs <draft source .html> <geo .json> <out .html>
//
// The output is what gets published as the Artifact; the source stays in
// docs/level-drafts/ so the next session edits the design, not the built file.
import fs from "node:fs";

const [src, geo, out] = process.argv.slice(2);
if (!src || !geo || !out) {
  console.error("usage: build.mjs <draft source .html> <geo .json> <out .html>");
  process.exit(2);
}
const page = fs.readFileSync(src, "utf8");
if (!page.includes("__GEO__")) {
  console.error(`${src} has no __GEO__ placeholder`);
  process.exit(1);
}
fs.writeFileSync(out, page.split("__GEO__").join(fs.readFileSync(geo, "utf8")));
console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
