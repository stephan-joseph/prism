/* One process: serves the static pages, the three extraction endpoints and (when SESSION_SECRET is set) sign-in.
   Single replica only. Without SESSION_SECRET nothing is gated and the extraction passphrase works as it always did. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { memoryStore, fileStore } from "./store.mjs";
import { statusHandler, extractHandler, usageHandler } from "./handlers.mjs";
import { createAuth } from "./auth.mjs";
import { authApi } from "./api.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BODY = 5 * 1024 * 1024; /* 600,000 characters of text, with room for JSON escaping */
const MAX_API_BODY = 64 * 1024;

/* Only these are served. The repo's other files never leave the image. */
const PAGES = { "/": "index.html", "/index.html": "index.html", "/guide.html": "guide.html", "/usage.html": "usage.html", "/login.html": "login.html", "/admin.html": "admin.html", "/extract-prompt.mjs": "extract-prompt.mjs" };
const DOCS = /^\/docs\/[\w.-]+$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".mjs": "text/javascript; charset=utf-8" };
const PUBLIC_PAGES = new Set(["/login.html"]);
const ADMIN_PAGES = new Set(["/usage.html", "/admin.html"]);
const rank = { viewer: 1, estimator: 2, admin: 3 };

export function makeServer({ env = process.env, dataDir = env.DATA_DIR || "/data", usageDir = env.USAGE_DIR || path.join(dataDir, "usage"), makeClient, jobs = memoryStore(), now } = {}) {
  const usage = fileStore(usageDir);
  const users = fileStore(path.join(dataDir, "users")), audit = fileStore(path.join(dataDir, "audit"));
  const auth = createAuth({ env, users, audit, ...(now ? { now } : {}) });
  const api = authApi({ auth });
  const client = makeClient || ((e) => new Anthropic({
    /* A gateway token is sent as "Authorization: Bearer"; a plain key as "x-api-key". The token wins if both are set. */
    ...(e.ANTHROPIC_AUTH_TOKEN ? { authToken: e.ANTHROPIC_AUTH_TOKEN, apiKey: null } : { apiKey: e.ANTHROPIC_API_KEY }),
    ...(e.ANTHROPIC_BASE_URL ? { baseURL: e.ANTHROPIC_BASE_URL } : {}),
  }));

  /* each route: method, the lowest role that may call it (null = needs no sign-in), handler */
  const routes = {
    "/.netlify/functions/extract-status": ["GET", "estimator", statusHandler({ jobs })],
    "/.netlify/functions/extract-inputs-background": ["POST", "estimator", extractHandler({
      jobs, usage, env, makeClient: client,
      AnthropicErrors: { AuthenticationError: Anthropic.AuthenticationError, RateLimitError: Anthropic.RateLimitError, APIError: Anthropic.APIError },
    })],
    "/.netlify/functions/extract-usage": ["GET", "admin", usageHandler({ usage, env })],
  };
  /* the sign-in and user endpoints: [method, lowest role, handler, still allowed while a new password is due] */
  const apis = {
    "/api/login": ["POST", null, api.login, true], "/api/logout": ["POST", null, api.logout, true], "/api/me": ["GET", null, api.me, true],
    "/api/password": ["POST", "viewer", api.password, true],
    "/api/users": ["GET", "admin", api.users], "/api/users/create": ["POST", "admin", api.createUser],
    "/api/users/update": ["POST", "admin", api.updateUser], "/api/users/reset": ["POST", "admin", api.resetPassword],
    "/api/audit": ["GET", "admin", api.audit],
  };

  async function readBody(req, max = MAX_BODY) {
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > max) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(c); }
    return Buffer.concat(chunks);
  }
  async function send(res, response, extra) {
    const h = Object.fromEntries(response.headers);
    res.writeHead(response.status, { ...h, ...extra });
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  const server = http.createServer(async (req, res) => {
    const secure = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
    const base = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", ...(secure ? { "Strict-Transport-Security": "max-age=15552000" } : {}) };
    const out = (status, headers = {}, body) => { res.writeHead(status, { ...base, ...headers }); res.end(body); };
    const json = (status, body, headers = {}) => out(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }, JSON.stringify(body));
    try {
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname;
      if (p === "/healthz") return out(200, {}, "ok");

      const session = auth.enabled ? await auth.session(req) : null;
      const apiRoute = apis[p], route = routes[p];
      const needs = apiRoute ? apiRoute[1] : route ? route[1] : ADMIN_PAGES.has(p) ? "admin" : PUBLIC_PAGES.has(p) ? null : "viewer";
      const asked = req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : req.socket.remoteAddress || "";

      if (auth.enabled && needs) {
        const isApi = !!apiRoute || !!route;
        if (!session) {
          if (isApi) return json(401, { error: "Sign in to continue.", signIn: true });
          return out(302, { Location: "/login.html?next=" + encodeURIComponent(p === "/" ? "/" : p), "Cache-Control": "no-store" });
        }
        if (session.mustChange && !(apiRoute && apiRoute[3])) {
          if (isApi) return json(403, { error: "Set a new password first.", mustChange: true });
          return out(302, { Location: "/login.html", "Cache-Control": "no-store" });
        }
        if (rank[session.role] < rank[needs]) {
          if (isApi) return json(403, { error: needs === "admin" ? "This is for administrators." : "Your account can view estimates but not run extraction." });
          return out(302, { Location: "/", "Cache-Control": "no-store" });
        }
      }
      /* a sliding session: hand back a fresh cookie when more than half of it is used */
      const renew = session && session.renew ? { "Set-Cookie": auth.cookieFor(session, secure) } : {};

      if (apiRoute) {
        if (!auth.enabled && p !== "/api/me") return json(404, { error: "Sign-in is not turned on." });
        if (req.method !== apiRoute[0]) return out(405, { Allow: apiRoute[0] });
        let body = {};
        if (req.method === "POST") {
          const origin = req.headers.origin;   /* a form on another site cannot call this with the visitor's cookie */
          if (origin && new URL(origin).host !== req.headers.host) return json(403, { error: "Blocked: the request came from another site." });
          try { body = JSON.parse((await readBody(req, MAX_API_BODY)).toString("utf8") || "{}"); } catch (e) { if (e.status) throw e; return json(400, { error: "Send JSON." }); }
          if (!body || typeof body !== "object") body = {};
        }
        const r = await apiRoute[2](body, { session, ip: asked, secure });
        return json(r.status, r.body, { ...renew, ...(r.cookie ? { "Set-Cookie": r.cookie } : {}) });
      }
      if (p === "/library-config.json") return json(200, { url: env.LIBRARY_URL || "" });
      if (route) {
        if (req.method !== route[0]) return out(405, { Allow: route[0] });
        const origin = req.headers.origin;
        if (auth.enabled && req.method === "POST" && origin && new URL(origin).host !== req.headers.host) return json(403, { error: "Blocked: the request came from another site." });
        const body = req.method === "POST" ? await readBody(req) : undefined;
        /* the person and role come from the session only. Anything a caller sent under these names is dropped. */
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (!/^x-prism-/i.test(k) && typeof v === "string") headers.set(k, v);
        if (session) { headers.set("x-prism-user", session.email); headers.set("x-prism-role", session.role); }
        const request = new Request(url, { method: req.method, headers, body });
        return await send(res, await route[2](request), { ...base, ...renew });
      }
      if (req.method !== "GET" && req.method !== "HEAD") return out(405);
      const file = PAGES[p] || (DOCS.test(p) ? p.slice(1) : null);
      if (!file) return out(404, { "Content-Type": "text/plain" }, "Not found");
      const data = await readFile(path.join(ROOT, file));
      return out(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": auth.enabled ? "no-store" : "no-cache", ...renew }, req.method === "HEAD" ? undefined : data);
    } catch (e) {
      const status = e.status || (e.code === "ENOENT" ? 404 : 500);
      res.writeHead(status, { ...base, "Content-Type": "text/plain" });
      res.end(e.status === 413 ? "Request too large" : e.code === "ENOENT" ? "Not found" : "Server error");
    }
  });
  server.ready = auth.bootstrap().catch((e) => console.error("bootstrap failed:", e && e.message));
  server.auth = auth;
  return server;
}

export const server = makeServer();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.PORT || 80);
  await server.ready;
  server.listen(PORT, () => console.log(`prism listening on ${PORT}${server.auth.enabled ? " (sign-in on)" : " (sign-in off)"}`));
}
