import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { getStore } from "@netlify/blobs";
import { buildExtractionPrompt, parseJsonReply, sanitizeExtraction } from "../../extract-prompt.mjs";
import { costOf, logRun } from "../../lib/usage.mjs";

// Background function (15-minute limit): Netlify acks with 202 at once and
// ignores the return value, so every outcome is written to a Blobs job record
// that the page polls through extract-status.mts. Same pattern as the original
// DAMO estimator, which moved here after long RFPs outran a synchronous function.

type Doc = { type: string; name: string; text: string };
const MAX_CHARS = 600_000; // the page warns before sending more than this

function jobStore() {
  return getStore({ name: "damo-workflow-extraction-jobs", consistency: "strong" });
}
function usageStore() {
  return getStore({ name: "damo-workflow-usage", consistency: "strong" });
}
const MODEL = "claude-opus-5-5";

export default async (req: Request, _context: Context) => {
  let body: { jobId?: string; docs?: Doc[]; passphrase?: string; activities?: boolean };
  try {
    body = await req.json();
  } catch {
    return;
  }
  const jobId = body.jobId;
  if (!jobId) return;
  const store = jobStore();
  /* usage log: one record per run with counts, sizes, model, tokens, cost and outcome. Never the documents or the answer. */
  const t0 = Date.now();
  const info: Record<string, unknown> = { jobId, requestedModel: MODEL, docs: 0, chars: 0, docTypes: [] };
  let apiMessage: any = null;
  const log = async (outcome: string) => {
    try {
      const mult = Number(Netlify.env.get("PRICE_MULTIPLIER") || 1) || 1;
      const model = apiMessage?.model || MODEL;
      const u = apiMessage?.usage;
      const c = costOf(model, u, mult);
      await logRun(usageStore(), {
        ...info, outcome, model: apiMessage ? model : null, durationMs: Date.now() - t0,
        inputTokens: u?.input_tokens || 0, outputTokens: u?.output_tokens || 0,
        cacheReadTokens: u?.cache_read_input_tokens || 0, cacheWriteTokens: u?.cache_creation_input_tokens || 0,
        costUsd: c.costUsd, priced: c.priced, stopReason: apiMessage?.stop_reason || null, fellBack: !!apiMessage && model !== MODEL,
      });
    } catch { /* logging must never break an extraction */ }
  };
  const fail = async (error: string, extra: Record<string, unknown> = {}, outcome = "error") => {
    await store.setJSON(jobId, { status: "error", error, ...extra });
    await log(outcome);
  };

  const passphrase = Netlify.env.get("INTAKE_PASSPHRASE");
  if (passphrase && body.passphrase !== passphrase) return fail("Incorrect passphrase", {}, "bad_passphrase");

  const docs = (body.docs || []).filter((d) => d && typeof d.text === "string" && d.text.trim());
  if (!docs.length) return fail("No document text was sent", {}, "no_docs");
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  info.docs = docs.length; info.chars = total; info.docTypes = docs.map((d) => String(d.type || "other").slice(0, 20));
  if (total > MAX_CHARS) return fail(`Documents are too long (${total.toLocaleString()} characters; limit ${MAX_CHARS.toLocaleString()}). Remove a document or paste the relevant sections.`, {}, "too_long");

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fail("The site has no Anthropic API key configured (ANTHROPIC_API_KEY)", {}, "no_key");

  await store.setJSON(jobId, { status: "running" });
  try {
    const client = new Anthropic({ apiKey });
    // Streaming keeps a long document from hitting request timeouts; finalMessage()
    // returns the complete reply. fallbacks: "default" re-runs a request that the
    // model's safety classifiers decline on Anthropic's recommended fallback model.
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high" },
      messages: [{ role: "user", content: buildExtractionPrompt(docs, { activities: body.activities === true }) }],
    });
    const message = await stream.finalMessage();
    apiMessage = message;

    if (message.stop_reason === "refusal") return fail("Claude declined to process these documents", {}, "refused");
    if (message.stop_reason === "max_tokens") return fail("The reply was cut short. Send fewer or shorter documents.", {}, "truncated");
    const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) return fail("Claude returned no text", {}, "empty");

    let parsed: unknown;
    try {
      parsed = parseJsonReply(text);
    } catch {
      return fail("Claude's reply wasn't valid JSON", { raw: text.slice(0, 500) }, "bad_json");
    }
    await store.setJSON(jobId, {
      status: "done",
      json: sanitizeExtraction(parsed),
      model: message.model,
      usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
    });
    await log("ok");
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return fail("The site's Anthropic API key was rejected", {}, "auth_error");
    if (err instanceof Anthropic.RateLimitError) return fail("Anthropic rate limit reached. Try again in a minute.", {}, "rate_limited");
    if (err instanceof Anthropic.APIError) return fail(`Anthropic API error ${err.status ?? ""}: ${err.message}`, {}, "api_error");
    return fail(err instanceof Error ? err.message : "Extraction failed");
  }
};
