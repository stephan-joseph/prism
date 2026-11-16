/* Checks the clause cleaning in extract-prompt.mjs. Run: node scripts/test-extract.mjs
   Exit code 0 means every check passed. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeExtraction, buildExtractionPrompt, MAX_CLAUSES, MAX_ACTIVITIES, UC_CATALOGUE, ACTIVITY_LIBRARY } from "../extract-prompt.mjs";

let n = 0;
const check = (name, fn) => { fn(); n++; console.log("ok -", name); };

const clauses = [
  { ref: "2.1", obligation: "Apps support", target: "P1 15 min", evidence: "q", source: "RFP" },
  { ref: " 2.1 ", obligation: "duplicate reference" },
  { ref: "", obligation: "no reference" },
  { ref: "3", obligation: "" },
  { ref: "Section 10", obligation: "Service levels" },
  "junk", null,
];

check("keeps good clauses, drops duplicates, blanks and junk", () => {
  const r = sanitizeExtraction({ clauses });
  assert.deepEqual(r.clauses.map((c) => c.ref), ["2.1", "Section 10"]);
  assert.equal(r.clauses[0].target, "P1 15 min");
});

check("caps the list", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ ref: "R" + i, obligation: "o" + i }));
  assert.equal(sanitizeExtraction({ clauses: many }).clauses.length, MAX_CLAUSES);
});

check("a tower keeps only references that exist, matched ignoring case and spacing", () => {
  const r = sanitizeExtraction({ clauses, towers: [{ kind: "AMS", clauseRefs: ["2.1", "section  10", "99", "2.1", 5] }] });
  assert.deepEqual(r.towers[0].clauseRefs, ["2.1", "Section 10"]);
});

check("a tower with no valid reference has no clauseRefs", () => {
  const r = sanitizeExtraction({ clauses, towers: [{ kind: "IMS", clauseRefs: ["nope"] }] });
  assert.equal("clauseRefs" in r.towers[0], false);
});

check("references are dropped when there is no clause list", () => {
  const r = sanitizeExtraction({ towers: [{ kind: "AMS", clauseRefs: ["2.1"] }] });
  assert.equal("clauseRefs" in r.towers[0], false);
  assert.equal("clauses" in r, false);
});

check("bad input does not throw", () => {
  assert.doesNotThrow(() => sanitizeExtraction({ clauses: "text", towers: [{ kind: "AMS", clauseRefs: "2.1" }] }));
  assert.doesNotThrow(() => sanitizeExtraction(null));
});

check("the prompt asks for clauses and tower references", () => {
  const p = buildExtractionPrompt([{ type: "rfp", name: "x", text: "hello" }]);
  assert.ok(p.includes('"clauses"') && p.includes("clauseRefs") && p.includes("Never invent a reference"));
});

/* ---- bottom-up activities ---- */
const acts = [
  { rfpRef: "4.2.1", name: "Monitor production alerts", towerKind: "AMS", libraryId: "AMS-01", driver: "Alerts a month", quantity: "1,200", useCaseIds: ["UC-01", "UC-99", 7, "UC-01"], evidence: "q", source: "RFP" },
  { rfpRef: " 4.2.1 ", name: "monitor  production alerts" },
  { name: "" }, { rfpRef: "5" }, "junk", null,
  { rfpRef: "6.1", name: "Resolve incidents", libraryId: "IMS-02", towerKind: "nope", quantity: -4 },
  { name: "Reports", libraryId: "NOPE-1", towerKind: "GOV", useCaseIds: ["constructor"] },
];

check("keeps good activities, drops duplicates, blanks and junk", () => {
  const r = sanitizeExtraction({ activities: acts });
  assert.deepEqual(r.activities.map((a) => a.name), ["Monitor production alerts", "Resolve incidents", "Reports"]);
  assert.equal(r.activities[0].quantity, 1200);
  assert.equal(r.activities[0].evidence, "q");
});

check("use case ids come only from the catalogue", () => {
  const r = sanitizeExtraction({ activities: acts });
  assert.deepEqual(r.activities[0].useCaseIds, ["UC-01"]);
  assert.equal("useCaseIds" in r.activities[2], false);
});

check("a library id must exist, and the tower kind falls back to the library entry's", () => {
  const r = sanitizeExtraction({ activities: acts });
  assert.equal(r.activities[0].libraryId, "AMS-01");
  assert.equal(r.activities[1].libraryId, "IMS-02");
  assert.equal(r.activities[1].towerKind, "IMS");
  assert.equal("quantity" in r.activities[1], false);
  assert.equal("libraryId" in r.activities[2], false);
  assert.equal(r.activities[2].towerKind, "GOV");
});

check("caps the activity list", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ rfpRef: "A" + i, name: "Activity " + i }));
  assert.equal(sanitizeExtraction({ activities: many }).activities.length, MAX_ACTIVITIES);
});

check("option years: zero is kept, out of range is dropped", () => {
  assert.equal(sanitizeExtraction({ optionYears: { value: 0 } }).optionYears.value, 0);
  assert.equal(sanitizeExtraction({ optionYears: { value: "2", evidence: "q" } }).optionYears.value, 2);
  assert.equal("optionYears" in sanitizeExtraction({ optionYears: { value: 9 } }), false);
});

check("bad activity input does not throw", () => {
  assert.doesNotThrow(() => sanitizeExtraction({ activities: "text", optionYears: 5 }));
  assert.doesNotThrow(() => sanitizeExtraction({ activities: [[], 3, { name: 5 }] }));
});

check("with bottom-up on the prompt asks for activities, lists the library and the catalogue, and bans guessed hours", () => {
  const p = buildExtractionPrompt([{ type: "rfp", name: "x", text: "hello" }], { activities: true });
  assert.ok(p.includes('"activities"') && p.includes("AMS-01 =") && p.includes("UC-29 =") && p.includes("Never estimate hours") && p.includes("optionYears"));
});

check("without bottom-up the prompt has no activities, library or catalogue, so a tower extraction stays short", () => {
  const docs = [{ type: "rfp", name: "x", text: "hello" }];
  const p = buildExtractionPrompt(docs), q = buildExtractionPrompt(docs, { activities: true });
  assert.ok(!p.includes("activities") && !p.includes("AMS-01") && !p.includes("UC-01") && !p.includes("optionYears"));
  assert.ok(p.includes('"clauses"') && p.includes("clauseRefs"));
  assert.ok(q.length > p.length + 2000);
});

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
check("the prompt's use case list matches CATALOGUE in index.html", () => {
  const inPage = [...page.matchAll(/BU_UC\("(UC-\d\d)","([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.equal(inPage.length, 29);
  assert.deepEqual(Object.entries(UC_CATALOGUE), inPage);
});

check("the starter library is consistent and uses only known ids", () => {
  const skills = new Set([...page.matchAll(/\{id:"([a-z0-9]+)",name:"[^"]+",absorb:/g)].map((m) => m[1]));
  const ids = new Set(), layers = ["run", "aiRun", "gov", "ci"], kinds = ["AMS", "IMS", "DMS", "AI", "GOV"], scal = ["fixed", "volume", "footprint", "uncal"];
  for (const l of ACTIVITY_LIBRARY) {
    assert.ok(!ids.has(l.id), "duplicate " + l.id); ids.add(l.id);
    assert.ok(kinds.includes(l.kind) && l.id.startsWith(l.kind + "-"), l.id + " kind");
    assert.ok(layers.includes(l.layer) && scal.includes(l.scaling), l.id + " layer or scaling");
    assert.ok(l.hpu > 0 && l.lever >= 0 && l.lever <= 100 && l.share1 > 0 && l.share1 <= 100, l.id + " numbers");
    assert.ok(l.role1 && (l.share1 === 100 || l.role2), l.id + " roles");
    assert.ok(l.ucs.every((u) => Object.hasOwn(UC_CATALOGUE, u)), l.id + " use cases");
    assert.ok(l.lever === 0 || l.ucs.length, l.id + " lever needs a use case");
    assert.ok(l.skills.every((k) => skills.has(k)), l.id + " skills");
    assert.ok(l.driver ? l.qty === null && l.scaling === "volume" : l.qty === 1 && l.scaling === "fixed", l.id + " driver");
  }
  assert.ok(skills.size > 10);
});

console.log(`${n} checks passed`);
