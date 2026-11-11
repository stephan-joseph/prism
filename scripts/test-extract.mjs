/* Checks the clause cleaning in extract-prompt.mjs. Run: node scripts/test-extract.mjs
   Exit code 0 means every check passed. */
import assert from "node:assert/strict";
import { sanitizeExtraction, buildExtractionPrompt, MAX_CLAUSES } from "../extract-prompt.mjs";

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

console.log(`${n} checks passed`);
