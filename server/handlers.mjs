/* The three extraction endpoints, ported from netlify/functions. Each takes its stores and
   settings as arguments so tests can stub them. Same behaviour and messages as the Netlify build. */
import { buildExtractionPrompt, parseJsonReply, sanitizeExtraction } from "../extract-prompt.mjs";
import { costOf, logRun, summarize } from "../lib/usage.mjs";

export const MODEL = "claude-opus-5-5";
export const MAX_CHARS = 600_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/* GET /.netlify/functions/extract-status?jobId= */
export function statusHandler({ jobs }) {
  return async (req) => {
    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) return json({ error: "Missing jobId" }, 400);
    return json((await jobs.get(jobId)) || { status: "pending" });
  };
}

/* POST /.netlify/functions/extract-inputs-background : answers 202 at once, the work continues in the process */
export function extractHandler({ jobs, usage, env, makeClient, AnthropicErrors = {} }) {
  const run = async (body) => {
    const jobId = body.jobId;
    const t0 = Date.now();
    const info = { jobId, requestedModel: MODEL, docs: 0, chars: 0, docTypes: [] };
    let apiMessage = null;
    const log = async (outcome) => {
      try {
        const mult = Number(env.PRICE_MULTIPLIER || 1) || 1;
        const model = apiMessage?.model || MODEL;
        const u = apiMessage?.usage;
        const c = costOf(model, u, mult);
        await logRun(usage, {
          ...info, outcome, model: apiMessage ? model : null, durationMs: Date.now() - t0,
          inputTokens: u?.input_tokens || 0, outputTokens: u?.output_tokens || 0,
          cacheReadTokens: u?.cache_read_input_tokens || 0, cacheWriteTokens: u?.cache_creation_input_tokens || 0,
          costUsd: c.costUsd, priced: c.priced, stopReason: apiMessage?.stop_reason || null, fellBack: !!apiMessage && model !== MODEL,
        });
      } catch { /* logging must never break an extraction */ }
    };
    const fail = async (error, extra = {}, outcome = "error") => {
      await jobs.setJSON(jobId, { status: "error", error, ...extra });
      await log(outcome);
    };

    if (env.INTAKE_PASSPHRASE && body.passphrase !== env.INTAKE_PASSPHRASE) return fail("Incorrect passphrase", {}, "bad_passphrase");
    const docs = (body.docs || []).filter((d) => d && typeof d.text === "string" && d.text.trim());
    if (!docs.length) return fail("No document text was sent", {}, "no_docs");
    const total = docs.reduce((n, d) => n + d.text.length, 0);
    info.docs = docs.length; info.chars = total; info.docTypes = docs.map((d) => String(d.type || "other").slice(0, 20));
    if (total > MAX_CHARS) return fail(`Documents are too long (${total.toLocaleString()} characters; limit ${MAX_CHARS.toLocaleString()}). Remove a document or paste the relevant sections.`, {}, "too_long");
    if (!env.ANTHROPIC_API_KEY) return fail("The site has no Anthropic API key configured (ANTHROPIC_API_KEY)", {}, "no_key");

    await jobs.setJSON(jobId, { status: "running" });
    try {
      const client = makeClient(env.ANTHROPIC_API_KEY);
      const stream = client.beta.messages.stream({
        model: MODEL, max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        output_config: { effort: "high" },
        messages: [{ role: "user", content: buildExtractionPrompt(docs) }],
      });
      const message = await stream.finalMessage();
      apiMessage = message;
      if (message.stop_reason === "refusal") return fail("Claude declined to process these documents", {}, "refused");
      if (message.stop_reason === "max_tokens") return fail("The reply was cut short. Send fewer or shorter documents.", {}, "truncated");
      const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (!text) return fail("Claude returned no text", {}, "empty");
      let parsed;
      try { parsed = parseJsonReply(text); } catch { return fail("Claude's reply wasn't valid JSON", { raw: text.slice(0, 500) }, "bad_json"); }
      await jobs.setJSON(jobId, {
        status: "done", json: sanitizeExtraction(parsed), model: message.model,
        usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
      });
      await log("ok");
    } catch (err) {
      const { AuthenticationError: A, RateLimitError: R, APIError: P } = AnthropicErrors;
      if (A && err instanceof A) return fail("The site's Anthropic API key was rejected", {}, "auth_error");
      if (R && err instanceof R) return fail("Anthropic rate limit reached. Try again in a minute.", {}, "rate_limited");
      if (P && err instanceof P) return fail(`Anthropic API error ${err.status ?? ""}: ${err.message}`, {}, "api_error");
      return fail(err instanceof Error ? err.message : "Extraction failed");
    }
  };

  return async (req) => {
    let body;
    try { body = await req.json(); } catch { return new Response(null, { status: 202 }); }
    if (!body?.jobId) return new Response(null, { status: 202 });
    run(body).catch(async (e) => { try { await jobs.setJSON(body.jobId, { status: "error", error: e?.message || "Extraction failed" }); } catch {} });
    return new Response(null, { status: 202 });
  };
}

/* GET /.netlify/functions/extract-usage */
export function usageHandler({ usage, env }) {
  return async (req) => {
    const key = env.USAGE_ADMIN_KEY;
    if (!key) return json({ error: "The usage report is off: set USAGE_ADMIN_KEY on the site to turn it on." }, 403);
    const url = new URL(req.url);
    if ((req.headers.get("x-usage-key") || url.searchParams.get("key")) !== key) return json({ error: "Wrong or missing key" }, 401);
    const { blobs } = await usage.list({ prefix: "run/" });
    const records = [];
    for (const b of blobs) { const r = await usage.get(b.key); if (r) records.push(r); }
    const rate = (name) => { const v = Number(env[name]); return Number.isFinite(v) && v > 0 ? v : 0; };
    const days = Number(url.searchParams.get("days")) || 30;
    const cfg = { days, hostingMonthlyUsd: rate("HOSTING_MONTHLY_USD"), usdPerFunctionSecond: rate("USD_PER_FUNCTION_SECOND"), usdPerThousandInvocations: rate("USD_PER_THOUSAND_INVOCATIONS") };
    if (url.searchParams.get("format") === "csv") {
      const cols = ["at", "outcome", "model", "docs", "chars", "inputTokens", "outputTokens", "cacheReadTokens", "costUsd", "durationMs", "stopReason", "fellBack"];
      const cutoff = Date.now() - days * 86400000;
      const rows = records.filter((r) => new Date(r.at).getTime() >= cutoff).sort((a, b) => a.at.localeCompare(b.at));
      const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
      return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=extraction-usage.csv", "Cache-Control": "no-store" } });
    }
    return json(summarize(records, cfg));
  };
}
