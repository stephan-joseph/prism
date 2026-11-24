/* Estimates saved on the server, and who may do what with them. Pure rules plus a thin store wrapper.
   An estimate: {id, deal, owner, sharedWith:[{email, access:"view"|"edit"}], orgView, updatedAt, updatedBy, version, state}.
   Roles come from sign-in (viewer < estimator < admin). The browser still keeps its own working copy. */
import crypto from "node:crypto";

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_SHARES = 50;
const ID = /^[a-f0-9]{16}$/;
const norm = (e) => String(e == null ? "" : e).trim().toLowerCase();
const emailOk = (e) => typeof e === "string" && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* what a person may do with one estimate: "none", "view", "edit" or "owner" (owner and admins manage it) */
export function accessOf(est, user) {
  if (!est || !user) return "none";
  if (user.role === "admin" || norm(est.owner) === norm(user.email)) return "owner";
  const s = (est.sharedWith || []).find((x) => norm(x.email) === norm(user.email));
  if (s) return s.access === "edit" ? "edit" : "view";
  return est.orgView ? "view" : "none";
}
const canWrite = (a) => a === "owner" || a === "edit";
const can = {
  read: (a) => a !== "none",
  save: (a, user) => canWrite(a) && user.role !== "viewer",   /* a viewer never saves, even to an estimate shared for edit */
  manage: (a) => a === "owner",                               /* share, unshare, delete */
};

const summary = (e, user) => ({
  id: e.id, deal: e.deal || "", owner: e.owner, version: e.version, updatedAt: e.updatedAt, updatedBy: e.updatedBy || "",
  status: (e.state && e.state.meta && e.state.meta.status) || "draft", orgView: !!e.orgView,
  access: accessOf(e, user), shared: (e.sharedWith || []).length,
});

export function estimatesApi({ store, auth, now = () => Date.now() }) {
  const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
  const iso = () => new Date(now()).toISOString();
  const load = async (id) => (ID.test(String(id || "")) ? await store.get("e/" + id) : null);
  const log = (event, who, detail) => auth.log(event, who, detail);

  /* the state must look like a saved estimate and fit in the size limit */
  function checkState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return "Send the estimate state.";
    if (Buffer.byteLength(JSON.stringify(state)) > MAX_BYTES) return "This estimate is larger than 2 MB, which is the limit.";
    return "";
  }

  return {
    async list(body, ctx) {
      const { blobs } = await store.list({ prefix: "e/" });
      const out = [];
      for (const b of blobs) { const e = await store.get(b.key); if (e && can.read(accessOf(e, ctx.session))) out.push(summary(e, ctx.session)); }
      out.sort((a, c) => String(c.updatedAt).localeCompare(String(a.updatedAt)));
      return { status: 200, body: { estimates: out } };
    },

    async get(body, ctx) {
      const e = await load(ctx.query.id);
      const a = accessOf(e, ctx.session);
      if (!e || !can.read(a)) return fail(404, "That estimate was not found.");   /* the same answer for missing and not allowed */
      return { status: 200, body: { estimate: { ...summary(e, ctx.session), sharedWith: can.manage(a) ? e.sharedWith : undefined, state: e.state } } };
    },

    /* create (no id) or update (id and the version you opened). A stale version is refused with the newer copy. */
    async save(body, ctx) {
      const u = ctx.session;
      const problem = checkState(body.state);
      if (problem) return fail(413, problem);
      const deal = String((body.state.deal != null ? body.state.deal : body.deal) || "").trim().slice(0, 120);
      if (!body.id) {
        const id = crypto.randomBytes(8).toString("hex");
        const est = { id, deal, owner: u.email, sharedWith: [], orgView: false, updatedAt: iso(), updatedBy: u.email, version: 1, state: body.state };
        await store.setJSON("e/" + id, est);
        await log("estimate_saved", u.email, `${id} new`);
        return { status: 200, body: { estimate: summary(est, u) } };
      }
      const e = await load(body.id), a = accessOf(e, u);
      if (!e || !can.read(a)) return fail(404, "That estimate was not found.");
      if (!can.save(a, u)) return fail(403, a === "view" ? "You can view this estimate but not change it." : "Your account cannot save to the server.");
      if (!Number.isInteger(body.version)) return fail(400, "Send the version you opened.");
      if (body.version !== e.version) return fail(409, "Someone saved a newer version first.", { current: { ...summary(e, u), state: e.state } });
      const next = { ...e, deal, state: body.state, version: e.version + 1, updatedAt: iso(), updatedBy: u.email };
      await store.setJSON("e/" + e.id, next);
      await log("estimate_saved", u.email, `${e.id} v${next.version}`);
      return { status: 200, body: { estimate: summary(next, u) } };
    },

    async remove(body, ctx) {
      const e = await load(body.id), a = accessOf(e, ctx.session);
      if (!e || !can.read(a)) return fail(404, "That estimate was not found.");
      if (!can.manage(a)) return fail(403, "Only the owner or an administrator can delete this.");
      await store.delete("e/" + e.id);
      await log("estimate_deleted", ctx.session.email, `${e.id} ${e.deal}`);
      return { status: 200, body: { ok: true } };
    },

    /* the owner or an admin sets who can see it: a full list replaces the old one */
    async share(body, ctx) {
      const e = await load(body.id), a = accessOf(e, ctx.session);
      if (!e || !can.read(a)) return fail(404, "That estimate was not found.");
      if (!can.manage(a)) return fail(403, "Only the owner or an administrator can change who sees this.");
      const list = Array.isArray(body.sharedWith) ? body.sharedWith : [];
      if (list.length > MAX_SHARES) return fail(400, `Share with at most ${MAX_SHARES} people.`);
      const seen = new Set(), out = [];
      for (const x of list) {
        const email = norm(x && x.email);
        if (!emailOk(email)) return fail(400, `"${String((x && x.email) || "").slice(0, 60)}" is not a valid email.`);
        if (email === norm(e.owner) || seen.has(email)) continue;
        seen.add(email); out.push({ email, access: x.access === "edit" ? "edit" : "view" });
      }
      for (const x of out) { const u = await auth.getUser(x.email); if (!u || u.active === false) return fail(400, `${x.email} has no active account. Add them on the Users page first.`); }
      const next = { ...e, sharedWith: out, orgView: body.orgView === true };
      await store.setJSON("e/" + e.id, next);
      await log("estimate_shared", ctx.session.email, `${e.id}: ${out.map((x) => x.email + ":" + x.access).join(",") || "nobody"}${next.orgView ? " + everyone view" : ""}`);
      return { status: 200, body: { estimate: summary(next, ctx.session), sharedWith: out } };
    },
  };
}
