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
const clientOf = (r) => () => ({ beta: { messages: r } });
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
console.log("all server tests pass");
