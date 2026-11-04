/* Tests for the EKS server with a stubbed Anthropic client. Run: node scripts/test-server.mjs */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { memoryStore, fileStore } from "../server/store.mjs";
import { statusHandler, extractHandler, usageHandler } from "../server/handlers.mjs";

const mk = (url, init) => new Request("http://x" + url, init);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reply = (text, extra = {}) => ({ stream: () => ({ finalMessage: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: "text", text }], ...extra }) }) });
const seen = [];
const clientOf = (r) => (e) => ({
  messages: { stream: (req) => { seen.push({ via: "plain", req, e }); return r.stream(req); } },
  beta: { messages: { stream: (req) => { seen.push({ via: "beta", req, e }); return r.stream(req); } } },
});
async function setup(env, r = reply('{"towers":[]}')) {
  const jobs = memoryStore(), usage = fileStore(mkdtempSync(path.join(tmpdir(), "u-")));
  return { jobs, usage, env, ext: extractHandler({ jobs, usage, env, makeClient: clientOf(r) }), st: statusHandler({ jobs }), us: usageHandler({ usage, env }) };
}
const post = (h, body) => h(mk("/e", { method: "POST", body: JSON.stringify(body) }));
const poll = async (s, id) => { for (let i = 0; i < 50; i++) { const j = await (await s.st(mk("/s?jobId=" + id))).json(); if (j.status !== "pending" && j.status !== "running") return j; await wait(20); } throw new Error("timeout"); };
let n = 0; const ok = (m) => console.log("ok", ++n, m);

{ const s = await setup({ ANTHROPIC_API_KEY: "k" });
  assert.equal((await s.st(mk("/s"))).status, 400); ok("status needs jobId");
  assert.deepEqual(await (await s.st(mk("/s?jobId=nope"))).json(), { status: "pending" }); ok("unknown job is pending");
  const r = await post(s.ext, { jobId: "a", docs: [{ type: "rfp", name: "d", text: "hello" }] });
  assert.equal(r.status, 202); ok("extract answers 202");
  const j = await poll(s, "a"); assert.equal(j.status, "done"); ok("job reaches done"); }
{ const s = await setup({ ANTHROPIC_API_KEY: "k", INTAKE_PASSPHRASE: "pw" });
  await post(s.ext, { jobId: "b", passphrase: "bad", docs: [{ text: "x" }] });
  assert.equal((await poll(s, "b")).error, "Incorrect passphrase"); ok("wrong passphrase refused");
  await post(s.ext, { jobId: "c", passphrase: "pw", docs: [{ text: "x" }] });
  assert.equal((await poll(s, "c")).status, "done"); ok("right passphrase accepted"); }
{ const s = await setup({ ANTHROPIC_API_KEY: "k" });
  await post(s.ext, { jobId: "d", docs: [{ text: "x".repeat(600001) }] });
  assert.match((await poll(s, "d")).error, /too long/); ok("too-long refused");
  await post(s.ext, { jobId: "e", docs: [] });
  assert.equal((await poll(s, "e")).error, "No document text was sent"); ok("no docs refused"); }
{ const s = await setup({});
  await post(s.ext, { jobId: "f", docs: [{ text: "x" }] });
  assert.match((await poll(s, "f")).error, /no Anthropic API key/); ok("missing key reported"); }
{ seen.length = 0;
  const s = await setup({ ANTHROPIC_AUTH_TOKEN: "tok", ANTHROPIC_BASE_URL: "https://gw.example", EXTRACTION_MODEL: "claude-sonnet-5-5" });
  await post(s.ext, { jobId: "gw", docs: [{ text: "x" }] });
  assert.equal((await poll(s, "gw")).status, "done");
  const g = seen.at(-1); assert.equal(g.via, "plain"); assert.equal(g.req.model, "claude-sonnet-5-5");
  assert.ok(!("betas" in g.req) && !("fallbacks" in g.req) && !("output_config" in g.req)); ok("gateway: token only, plain request, chosen model"); }
{ seen.length = 0;
  const s = await setup({ ANTHROPIC_API_KEY: "k" });
  await post(s.ext, { jobId: "dir", docs: [{ text: "x" }] }); await poll(s, "dir");
  const g = seen.at(-1); assert.equal(g.via, "beta"); assert.equal(g.req.model, "claude-opus-5-5"); assert.equal(g.req.fallbacks, "default"); ok("direct: original request unchanged"); }
{ seen.length = 0;
  const s = await setup({ ANTHROPIC_AUTH_TOKEN: "tok", ANTHROPIC_BASE_URL: "https://gw", EXTRACTION_SIMPLE_REQUEST: "0" });
  await post(s.ext, { jobId: "full", docs: [{ text: "x" }] }); await poll(s, "full");
  assert.equal(seen.at(-1).via, "beta"); ok("simple request can be switched off"); }
{ const s = await setup({ ANTHROPIC_API_KEY: "k" }, reply("not json"));
  await post(s.ext, { jobId: "g", docs: [{ text: "x" }] });
  assert.match((await poll(s, "g")).error, /valid JSON/); ok("bad JSON reported"); }
{ const s = await setup({ ANTHROPIC_API_KEY: "k" }, reply("", { stop_reason: "max_tokens" }));
  await post(s.ext, { jobId: "h", docs: [{ text: "x" }] });
  assert.match((await poll(s, "h")).error, /cut short/); ok("truncation reported"); }
{ const s = await setup({ ANTHROPIC_API_KEY: "k", USAGE_ADMIN_KEY: "adm" });
  await post(s.ext, { jobId: "i", docs: [{ text: "SECRET-DOC-TEXT" }] }); await poll(s, "i"); await wait(50);
  assert.equal((await s.us(mk("/u"))).status, 401); ok("usage needs key");
  const r = await s.us(mk("/u?days=30", { headers: { "x-usage-key": "adm" } }));
  assert.equal(r.status, 200); const body = await r.text();
  assert.ok(!body.includes("SECRET-DOC-TEXT")); ok("usage report works, no document text");
  const csv = await s.us(mk("/u?format=csv&key=adm")); assert.match(await csv.text(), /^at,outcome/); ok("usage csv");
  const off = await setup({}); assert.equal((await off.us(mk("/u"))).status, 403); ok("usage off without key"); }
{ /* every file the pages load must be served, with a type the browser accepts */
  const { readFileSync } = await import("node:fs");
  const { server } = await import("../server/server.mjs");
  await new Promise((r) => server.listen(0, r));
  const base = "http://localhost:" + server.address().port;
  const need = new Set();
  for (const f of ["index.html", "guide.html", "usage.html"]) {
    const html = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    for (const m of html.matchAll(/(?:import[^"']*from\s*|src=|href=)["'](\.\/[^"']+|\/[^"'\/][^"']*)["']/g)) need.add(m[1].replace(/^\.\//, "/"));
  }
  for (const p of need) { const r = await fetch(base + p); assert.equal(r.status, 200, p + " must be served"); }
  assert.match((await fetch(base + "/extract-prompt.mjs")).headers.get("content-type"), /javascript/); ok("files the pages load are served: " + [...need].join(" "));
  assert.equal((await fetch(base + "/package.json")).status, 404); ok("other files stay hidden");
  server.close(); }
console.log("all server tests pass");
