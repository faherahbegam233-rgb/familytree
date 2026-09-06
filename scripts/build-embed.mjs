// Extracts the verified tree UI (CSS + body markup + JS) out of
// family-tree-preview.html and adapts it to run inside the Next.js app:
//  - the hardcoded data block is swapped for window.__TREE_DATA__ (fetched
//    from Supabase at request time, so edits actually persist)
//  - the two placeholder "Upload photo" / "Suggest an edit" toast buttons
//    become real actions wired up by a script appended in components/TreeApp.tsx
//  - an Admin link is added to the tabbar
// Run with: node scripts/build-embed.mjs
import { readFileSync, writeFileSync } from "fs";

const SRC = "/home/claude/family-tree-preview.html";
const lines = readFileSync(SRC, "utf8").split("\n");

function sliceLines(oneIndexedStart, oneIndexedEndInclusive) {
  return lines.slice(oneIndexedStart - 1, oneIndexedEndInclusive).join("\n");
}

// ---- sanity check the boundaries still hold ----
if (lines[0] !== '<title>Abu Bakar, Kuddus & Maricar</title>') {
  throw new Error("Title line moved — re-check line numbers before extracting.");
}
if (lines[1] !== "<style>" || lines[199] !== "</style>") {
  throw new Error("<style> boundaries moved — re-check line numbers.");
}
if (lines[201] !== '<div class="wrap">') {
  throw new Error("Body start moved — re-check line numbers.");
}
if (lines[327] !== "(function(){") {
  throw new Error("Script start moved — re-check line numbers.");
}

const css = sliceLines(3, 199);
let body = sliceLines(202, 326);
let script = sliceLines(328, 1188);

// ---- 1. Add an Admin link to the tabbar ----
const tabbarNeedle = '<button data-mode="all">All People</button>\n  </div>';
if (!body.includes(tabbarNeedle)) throw new Error("Tabbar closing markup not found");
body = body.replace(
  tabbarNeedle,
  '<button data-mode="all">All People</button>\n    <a href="/admin" class="admin-link" style="margin-left:auto;align-self:center;font-size:12px;font-weight:600;color:var(--muted);text-decoration:none;">Admin login &rarr;</a>\n  </div>'
);

// ---- 2. Swap the hardcoded data block for window.__TREE_DATA__ ----
const dataStart = script.indexOf('function P(name, gender, gen, extra)');
const familiesStart = script.indexOf("var FAMILIES = {");
if (dataStart === -1 || familiesStart === -1) throw new Error("Data block markers not found in script");
const replacementData = `function P(name, gender, gen, extra){ return Object.assign({name,gender,gen}, extra||{}); }
  var __TD = window.__TREE_DATA__ || {A:{},Aunions:[],K:{},Kunions:[],M:{},Munions:[]};
  var A = __TD.A, Aunions = __TD.Aunions, K = __TD.K, Kunions = __TD.Kunions, M = __TD.M, Munions = __TD.Munions;

  `;
script = script.slice(0, dataStart) + replacementData + script.slice(familiesStart);

// ---- 3. Merge live photo_url overrides on top of the built-in placeholder photos ----
const photosVarStart = script.indexOf("var PHOTOS = {");
const flavorVarStart = script.indexOf("var FLAVOR = {");
if (photosVarStart === -1 || flavorVarStart === -1) throw new Error("PHOTOS/FLAVOR markers not found");
script =
  script.slice(0, flavorVarStart) +
  "Object.assign(PHOTOS, (window.__TREE_DATA__ && window.__TREE_DATA__.photoOverrides) || {});\n  " +
  script.slice(flavorVarStart);

// ---- 4. Real actions instead of toast-only buttons ----
const oldButtons =
  '\'<button class="btn primary" data-toast="Photo uploads save live once we build the real dashboard.">Upload photo</button>\'+\n' +
  '      \'<button class="btn" data-toast="Suggested edits will route to an admin approval queue in the live version.">Suggest an edit</button>\'+';
const newButtons =
  '\'<button class="btn primary" data-action="upload-photo">Upload photo</button>\'+\n' +
  '      \'<button class="btn" data-action="suggest-edit">Suggest an edit</button>\'+';
if (!script.includes(oldButtons)) throw new Error("Detail-modal action buttons markup not found");
script = script.replace(oldButtons, newButtons);

const oldOpenDetail =
  `function openDetail(pid, famKey){
    document.getElementById("modalContent").innerHTML = buildDetailHTML(pid, famKey);
    document.querySelectorAll("#modalContent [data-toast]").forEach(function(btn){
      btn.addEventListener("click", function(e){ e.stopPropagation(); showToast(btn.dataset.toast); });
    });
    document.getElementById("scrim").classList.add("open");
  }`;
const newOpenDetail =
  `function openDetail(pid, famKey){
    document.getElementById("modalContent").innerHTML = buildDetailHTML(pid, famKey);
    document.querySelectorAll("#modalContent [data-action]").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        if(btn.dataset.action==="upload-photo" && window.__openUploadPhoto) window.__openUploadPhoto(pid, famKey);
        else if(btn.dataset.action==="suggest-edit" && window.__openSuggestEdit) window.__openSuggestEdit(pid, famKey);
      });
    });
    document.getElementById("scrim").classList.add("open");
  }`;
if (!script.includes(oldOpenDetail)) throw new Error("openDetail() body not found verbatim");
script = script.replace(oldOpenDetail, newOpenDetail);

writeFileSync("/home/claude/family-tree-app/data/tree.css", css + "\n");
writeFileSync("/home/claude/family-tree-app/data/tree.body.html", body + "\n");
writeFileSync("/home/claude/family-tree-app/data/tree.script.js", script + "\n");
console.log("Wrote data/tree.css, data/tree.body.html, data/tree.script.js");
