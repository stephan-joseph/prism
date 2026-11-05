/* One process: serves the static pages and the three extraction endpoints. Single replica only. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { memoryStore, fileStore } from "./store.mjs";
import { statusHandler, extractHandler, usageHandler } from "./handlers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 80);
const MAX_BODY = 5 * 1024 * 1024; /* 600,000 characters of text, with room for JSON escaping */

const jobs = memoryStore();
const usage = fileStore(process.env.USAGE_DIR || "/data/usage");
const env = process.env;

const routes = {
  "/.netlify/functions/extract-status": ["GET", statusHandler({ jobs })],
  "/.netlify/functions/extract-inputs-background": ["POST", extractHandler({
    jobs, usage, env, makeClient: (e) => new Anthropic({
      /* A gateway token is sent as "Authorization: Bearer"; a plain key as "x-api-key". The token wins if both are set. */
      ...(e.ANTHROPIC_AUTH_TOKEN ? { authToken: e.ANTHROPIC_AUTH_TOKEN, apiKey: null } : { apiKey: e.ANTHROPIC_API_KEY }),
      ...(e.ANTHROPIC_BASE_URL ? { baseURL: e.ANTHROPIC_BASE_URL } : {}),
    }),
    AnthropicErrors: { AuthenticationError: Anthropic.AuthenticationError, RateLimitError: Anthropic.RateLimitError, APIError: Anthropic.APIError },
  })],
  "/.netlify/functions/extract-usage": ["GET", usageHandler({ usage, env })],
};

/* Only these are served. The repo's other files never leave the image. */
const PAGES = { "/": "index.html", "/index.html": "index.html", "/guide.html": "guide.html", "/usage.html": "usage.html", "/extract-prompt.mjs": "extract-prompt.mjs" };
const DOCS = /^\/docs\/[\w.-]+$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".mjs": "text/javascript; charset=utf-8" };

async function readBody(req) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
    if (url.pathname === "/library-config.json") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); return res.end(JSON.stringify({ url: process.env.LIBRARY_URL || "" })); }
    const route = routes[url.pathname];
    if (route) {
      if (req.method !== route[0]) { res.writeHead(405, { Allow: route[0] }); return res.end(); }
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const request = new Request(url, { method: req.method, headers: req.headers, body });
      return await send(res, await route[1](request));
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    const file = PAGES[url.pathname] || (DOCS.test(url.pathname) ? url.pathname.slice(1) : null);
    if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const data = await readFile(path.join(ROOT, file));
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (e) {
    res.writeHead(e.status || (e.code === "ENOENT" ? 404 : 500), { "Content-Type": "text/plain" });
    res.end(e.status === 413 ? "Request too large" : e.code === "ENOENT" ? "Not found" : "Server error");
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`prism listening on ${PORT}`));
