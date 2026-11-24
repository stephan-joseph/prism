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
{ /* the bottom-up method asks for activities and option years; a tower extraction keeps the shorter prompt */
  seen.length = 0;
  const s = await setup({ ANTHROPIC_API_KEY: "k" });
  await post(s.ext, { jobId: "tw", docs: [{ text: "x" }] }); await poll(s, "tw");
  const tower = seen.at(-1).req.messages[0].content;
  await post(s.ext, { jobId: "bu", activities: true, docs: [{ text: "x" }] }); await poll(s, "bu");
  const bu = seen.at(-1).req.messages[0].content;
  await post(s.ext, { jobId: "bu2", activities: "yes", docs: [{ text: "x" }] }); await poll(s, "bu2");
  const loose = seen.at(-1).req.messages[0].content;
  assert.ok(!tower.includes("activities") && !tower.includes("UC-01") && tower.includes("clauses")); ok("tower request: no activities in the prompt");
  assert.ok(bu.includes('"activities"') && bu.includes("AMS-01 =") && bu.includes("UC-29 =") && bu.includes("optionYears") && bu.length > tower.length); ok("bottom-up request: activities, library and catalogue in the prompt");
  assert.equal(loose, tower); ok("only a real true turns activities on"); }
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

/* ---- sign-in, roles and the gate (SESSION_SECRET on) ---- */
{ const { makeServer } = await import("../server/server.mjs");
  const { hashPassword, checkPassword, passwordProblem, tempPassword } = await import("../server/auth.mjs");

  const h = await hashPassword("a-long-enough-pass"); assert.ok(await checkPassword("a-long-enough-pass", h)); assert.ok(!(await checkPassword("a-long-enough-pasX", h)));
  assert.ok(h.hash !== "a-long-enough-pass" && !JSON.stringify(h).includes("a-long-enough-pass")); ok("password is hashed and verified");
  assert.ok(passwordProblem("short")); assert.equal(passwordProblem("twelve-chars!"), ""); assert.notEqual(tempPassword(), tempPassword()); ok("password rules, temporary passwords differ");

  const dir = mkdtempSync(path.join(tmpdir(), "d-"));
  let clock = Date.now();
  const stub = reply('{"towers":[]}');
  const env = { SESSION_SECRET: "test-secret-0123456789", ADMIN_EMAIL: "Boss@Example.test", ADMIN_PASSWORD: "first-admin-pass-1", ANTHROPIC_API_KEY: "k", INTAKE_PASSPHRASE: "should-not-matter" };
  const srv = makeServer({ env, dataDir: dir, makeClient: clientOf(stub), now: () => clock });
  await srv.ready; await new Promise((r) => srv.listen(0, r));
  const base = "http://localhost:" + srv.address().port;
  const call = async (p, o = {}) => { const r = await fetch(base + p, { redirect: "manual", ...o, headers: { "Content-Type": "application/json", ...(o.headers || {}) } }); let j = null; try { j = await r.clone().json(); } catch {} return { r, j, status: r.status }; };
  const post = (p, body, cookie, extra = {}) => call(p, { method: "POST", body: JSON.stringify(body), headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra } });
  const get = (p, cookie, extra = {}) => call(p, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra } });
  const ck = (res) => (res.r.headers.get("set-cookie") || "").split(";")[0];
  const login = async (email, password) => { const x = await post("/api/login", { email, password }); return { ...x, cookie: ck(x) }; };

  /* anonymous */
  assert.equal((await get("/healthz")).status, 200); ok("healthz stays open");
  for (const p of ["/", "/index.html", "/guide.html", "/usage.html", "/admin.html", "/docs/example-acme-retail.damo.json"]) { const x = await get(p); assert.equal(x.status, 302, p); assert.match(x.r.headers.get("location"), /^\/login\.html/); }
  assert.equal((await get("/login.html")).status, 200); ok("anonymous pages redirect to the sign-in page, which stays open");
  for (const p of ["/api/users", "/api/audit", "/library-config.json", "/.netlify/functions/extract-usage", "/.netlify/functions/extract-status?jobId=x"]) assert.equal((await get(p)).status, p === "/library-config.json" ? 302 : 401, p);
  assert.equal((await post("/.netlify/functions/extract-inputs-background", { jobId: "z", docs: [{ text: "x" }] })).status, 401); ok("anonymous API calls get 401");
  assert.equal((await get("/extract-prompt.mjs")).status, 302); ok("the prompt module is behind sign-in too");
  assert.equal((await get("/api/me")).j.user, null); ok("me says nobody is signed in");

  /* first admin, bad passwords, lockout */
  const bad1 = await login("boss@example.test", "wrong-password-here"), bad2 = await login("nobody@example.test", "wrong-password-here");
  assert.equal(bad1.status, 401); assert.equal(bad1.j.error, bad2.j.error); ok("a wrong password and an unknown account give the same answer");
  for (let i = 0; i < 4; i++) await login("boss@example.test", "wrong-password-here");
  const locked = await login("boss@example.test", "first-admin-pass-1"); assert.equal(locked.status, 429); ok("five failures lock the account, even for the right password");
  clock += 16 * 60 * 1000; const adm = await login("BOSS@example.test ", "first-admin-pass-1"); assert.equal(adm.status, 200); ok("the lock lifts after 15 minutes, and email case and spaces do not matter");
  assert.ok(adm.cookie.startsWith("prism_session=")); assert.match(adm.r.headers.get("set-cookie"), /HttpOnly/); assert.match(adm.r.headers.get("set-cookie"), /SameSite=Lax/); assert.doesNotMatch(adm.r.headers.get("set-cookie"), /Secure/); ok("session cookie is HttpOnly and SameSite, and not Secure over plain http");
  const sec = await post("/api/login", { email: "boss@example.test", password: "first-admin-pass-1" }, null, { "X-Forwarded-Proto": "https" }); assert.match(sec.r.headers.get("set-cookie"), /Secure/); assert.ok(sec.r.headers.get("strict-transport-security")); ok("over HTTPS the cookie is Secure and HSTS is sent");
  assert.equal(adm.j.user.mustChange, true); assert.equal((await get("/", adm.cookie)).status, 302); assert.equal((await get("/api/users", adm.cookie)).status, 403); ok("a first sign-in must change the password before anything else");
  assert.equal((await post("/api/password", { current: "first-admin-pass-1", next: "short" }, adm.cookie)).status, 400);
  assert.equal((await post("/api/password", { current: "wrong-current-pass", next: "a-new-admin-pass-22" }, adm.cookie)).status, 400);
  const ch = await post("/api/password", { current: "first-admin-pass-1", next: "a-new-admin-pass-22" }, adm.cookie); assert.equal(ch.status, 200); const A = ck(ch); ok("password change checks the old one and the length");
  assert.equal((await get("/api/users", adm.cookie)).status, 401); ok("the old session ends when the password changes");
  assert.equal((await get("/", A)).status, 200); assert.match((await get("/", A)).r.headers.get("x-frame-options"), /DENY/); ok("a signed-in person reaches the pages, with security headers");

  /* a tampered or expired cookie */
  assert.equal((await get("/api/users", A.slice(0, -3) + "abc")).status, 401); assert.equal((await get("/api/users", "prism_session=garbage")).status, 401); ok("a tampered cookie is refused");

  /* users */
  const mkU = async (email, role) => { const x = await post("/api/users/create", { email, name: email.split("@")[0], role }, A); assert.equal(x.status, 200, JSON.stringify(x.j)); return x.j.tempPassword; };
  assert.equal((await post("/api/users/create", { email: "bad", role: "viewer" }, A)).status, 400); assert.equal((await post("/api/users/create", { email: "x@example.test", role: "boss" }, A)).status, 400);
  const tpE = await mkU("est@example.test", "estimator"), tpV = await mkU("view@example.test", "viewer"); assert.equal((await post("/api/users/create", { email: "est@example.test", role: "viewer" }, A)).status, 400); ok("admin creates users, with checks and no duplicates");
  const ev = await login("est@example.test", tpE); assert.equal(ev.j.user.mustChange, true);
  const E = ck(await post("/api/password", { current: tpE, next: "estimator-pass-123" }, ev.cookie));
  const V = ck(await post("/api/password", { current: tpV, next: "viewer-pass-12345" }, (await login("view@example.test", tpV)).cookie)); ok("a temporary password is changed at first sign-in");
  assert.equal((await login("est@example.test", tpE)).status, 401); ok("the temporary password stops working once changed");

  /* role matrix */
  const docs = { jobId: "r1", docs: [{ type: "rfp", name: "d", text: "hello" }] };
  const code = async (m, p, c, b) => (m === "GET" ? get(p, c) : post(p, b || {}, c)).then((x) => x.status);
  assert.equal(await code("GET", "/", V), 200); assert.equal(await code("GET", "/guide.html", V), 200); assert.equal(await code("GET", "/library-config.json", V), 200);
  assert.equal(await code("POST", "/.netlify/functions/extract-inputs-background", V, docs), 403); assert.equal(await code("GET", "/.netlify/functions/extract-status?jobId=x", V), 403);
  assert.equal(await code("GET", "/api/users", V), 403); assert.equal(await code("GET", "/usage.html", V), 302); assert.equal(await code("GET", "/.netlify/functions/extract-usage", V), 403); ok("viewer: opens the tool, cannot extract, no admin");
  assert.equal(await code("POST", "/.netlify/functions/extract-inputs-background", E, docs), 202);
  assert.equal(await code("GET", "/api/users", E), 403); assert.equal(await code("GET", "/admin.html", E), 302); assert.equal(await code("GET", "/.netlify/functions/extract-usage", E), 403); ok("estimator: extracts, no admin");
  assert.equal(await code("GET", "/api/users", A), 200); assert.equal(await code("GET", "/usage.html", A), 200); assert.equal(await code("GET", "/admin.html", A), 200); ok("admin: users, usage page, admin page");
  assert.equal(await code("POST", "/.netlify/functions/extract-inputs-background", null, docs), 401); ok("extraction needs a session, not the shared passphrase");
  const done = await (async () => { for (let i = 0; i < 50; i++) { const j = (await get("/.netlify/functions/extract-status?jobId=r1", E)).j; if (j && j.status === "done") return j; await wait(20); } return null; })();
  assert.ok(done); ok("a signed-in estimator's extraction runs, with no passphrase");

  /* the person and role headers cannot be forged, and the run is logged with the email */
  await wait(80);
  const um = await get("/.netlify/functions/extract-usage?days=30", A); assert.equal(um.status, 200);
  const files = (await fileStore(path.join(dir, "usage")).list({ prefix: "run/" })).blobs;
  const rec = await fileStore(path.join(dir, "usage")).get(files[0].key); assert.equal(rec.user, "est@example.test"); assert.ok(!JSON.stringify(rec).includes("hello")); ok("the run record carries the email and never the document text");
  const forged = await get("/.netlify/functions/extract-usage", E, { "x-prism-role": "admin" }); assert.equal(forged.status, 403); ok("a forged role header does nothing");

  /* role and status changes take effect at once, and the last admin cannot be removed */
  assert.equal((await post("/api/users/update", { email: "est@example.test", role: "viewer" }, A)).status, 200);
  assert.equal(await code("GET", "/", E), 302); ok("changing a role signs the person out");
  const E2 = ck(await login("est@example.test", "estimator-pass-123")); assert.equal(await code("POST", "/.netlify/functions/extract-inputs-background", E2, docs), 403); ok("the new role applies on the next sign-in");
  assert.equal((await post("/api/users/update", { email: "view@example.test", active: false }, A)).status, 200); assert.equal(await code("GET", "/", V), 302); assert.equal((await login("view@example.test", "viewer-pass-12345")).status, 401); ok("a deactivated person is out at once and cannot sign in");
  assert.equal((await post("/api/users/update", { email: "boss@example.test", role: "viewer" }, A)).status, 400); assert.equal((await post("/api/users/update", { email: "boss@example.test", active: false }, A)).status, 400); ok("the last administrator cannot be demoted or deactivated");
  const rs = await post("/api/users/reset", { email: "est@example.test" }, A); assert.equal(rs.status, 200); assert.equal((await login("est@example.test", "estimator-pass-123")).status, 401); assert.equal((await login("est@example.test", rs.j.tempPassword)).j.user.mustChange, true); ok("an admin reset gives a one-time password and ends the old one");
  const au = await get("/api/audit", A); assert.ok(au.j.events.some((e) => e.event === "user_created") && au.j.events.some((e) => e.event === "login_failed")); assert.ok(!JSON.stringify(au.j).includes("estimator-pass-123")); ok("the audit log records events and never a password");
  assert.equal((await post("/api/login", { email: "boss@example.test", password: "x" }, null, { Origin: "http://evil.example" })).status, 403); ok("a request from another site is refused");
  const tp3 = await mkU("est3@example.test", "estimator"), E3 = ck(await post("/api/password", { current: tp3, next: "estimator3-pass-123" }, (await login("est3@example.test", tp3)).cookie));
  assert.equal((await post("/api/users/create", { email: "n@example.test", role: "viewer" }, E3)).status, 403); ok("only an administrator can add people");
  clock += 9 * 3600 * 1000; assert.equal((await get("/api/users", A)).status, 401); ok("a session ends after 8 hours");
  srv.close();

  /* sign-in off: nothing changes */
  const off = makeServer({ env: { ANTHROPIC_API_KEY: "k", INTAKE_PASSPHRASE: "pp" }, dataDir: mkdtempSync(path.join(tmpdir(), "o-")), makeClient: clientOf(stub) });
  await off.ready; await new Promise((r) => off.listen(0, r));
  const ob = "http://localhost:" + off.address().port;
  assert.equal((await fetch(ob + "/")).status, 200); assert.equal((await fetch(ob + "/admin.html")).status, 200 && 200); assert.equal((await (await fetch(ob + "/api/me")).json()).enabled, false); assert.equal((await fetch(ob + "/api/users")).status, 404);
  assert.equal((await fetch(ob + "/.netlify/functions/extract-usage")).status, 403); ok("with sign-in off the site is open and the passphrase still rules extraction");
  off.close();
}
console.log("all server tests pass");
