/* Accounts, passwords, sessions and roles for the EKS build.
   Sign-in is on when SESSION_SECRET is set; without it the server behaves as it always did (the extraction passphrase).
   Passwords are hashed with scrypt from Node, never stored or logged. Sessions are a signed cookie, and every request
   re-reads the account, so a deactivated user or a changed role takes effect at once. No outside packages. */
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64, COST = { N: 16384, r: 8, p: 1 };

export const ROLES = ["viewer", "estimator", "admin"];
export const MIN_PASSWORD = 12, MAX_PASSWORD = 200;
export const SESSION_MS = 8 * 3600 * 1000;          /* sliding: renewed while the person works */
export const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;
export const COOKIE = "prism_session";

export const normEmail = (e) => String(e == null ? "" : e).trim().toLowerCase();
export const emailOk = (e) => typeof e === "string" && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const passwordProblem = (pw) =>
  typeof pw !== "string" || pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.`
    : pw.length > MAX_PASSWORD ? "That password is too long." : "";

export async function hashPassword(pw, salt = crypto.randomBytes(16)) {
  const h = await scrypt(pw, salt, KEYLEN, COST);
  return { salt: salt.toString("base64"), hash: h.toString("base64") };
}
export async function checkPassword(pw, rec) {
  if (typeof pw !== "string" || pw.length > MAX_PASSWORD) pw = "";
  const h = await scrypt(pw, Buffer.from(rec.salt, "base64"), KEYLEN, COST);
  const a = Buffer.from(rec.hash, "base64");
  return a.length === h.length && crypto.timingSafeEqual(a, h);
}
/* a one-time password an admin hands over; the person must replace it at first sign-in */
export function tempPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const s = [...crypto.randomBytes(18)].map((b) => A[b % A.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 9)}-${s.slice(9, 14)}-${s.slice(14, 18)}`;
}

const b64 = (x) => Buffer.from(x).toString("base64url");
const publicUser = (u) => ({ email: u.email, name: u.name || "", role: u.role, active: u.active !== false, mustChange: !!u.mustChange, createdAt: u.createdAt || null });

export function createAuth({ env, users, audit, now = () => Date.now() }) {
  const secret = env.SESSION_SECRET || "";
  const enabled = secret.length > 0;
  const mac = (s) => crypto.createHmac("sha256", secret).update(s).digest("base64url");
  const sign = (payload) => { const p = b64(JSON.stringify(payload)); return `${p}.${mac(p)}`; };
  const parse = (value) => {
    if (!enabled || typeof value !== "string") return null;
    const i = value.indexOf(".");
    if (i < 1) return null;
    const p = value.slice(0, i), m = value.slice(i + 1), want = mac(p);
    if (m.length !== want.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want))) return null;
    try { const j = JSON.parse(Buffer.from(p, "base64url").toString("utf8")); return j && j.x > now() ? j : null; } catch { return null; }
  };

  /* failed attempts: per account and per address, in memory */
  const fails = new Map();
  const lockedFor = (k) => { const f = fails.get(k); return f && f.until > now() ? f.until - now() : 0; };
  /* an account locks after 5 failures. An address locks after 25, because behind a load balancer many people can share one address. */
  const noteFail = (k, limit = LOCK_AFTER) => { const f = fails.get(k) || { n: 0, until: 0 }; if (f.until && f.until <= now()) { f.n = 0; f.until = 0; } f.n++; if (f.n >= limit) f.until = now() + LOCK_MS; fails.set(k, f); };
  const clearFails = (k) => fails.delete(k);

  const log = async (event, who, detail) => {
    try { await audit.setJSON(`${new Date(now()).toISOString()}-${crypto.randomBytes(3).toString("hex")}`, { at: new Date(now()).toISOString(), event, who: who || "", detail: detail || "" }); } catch { /* an audit failure must never block a person */ }
  };

  let dummy = null;
  const burn = async (pw) => { dummy = dummy || await hashPassword("not-a-real-password"); await checkPassword(pw, dummy); };   /* an unknown account costs the same time as a wrong password */

  const getUser = async (email) => { const u = await users.get(normEmail(email)); return u && typeof u === "object" ? u : null; };
  const listUsers = async () => {
    const { blobs } = await users.list({ prefix: "" });
    const out = [];
    for (const b of blobs) { const u = await users.get(b.key); if (u) out.push(u); }
    return out.sort((a, c) => a.email.localeCompare(c.email));
  };
  const activeAdmins = (all) => all.filter((u) => u.role === "admin" && u.active !== false);

  async function newRecord({ email, name, role, password, mustChange }) {
    const { salt, hash } = await hashPassword(password);
    return { email, name: String(name || "").trim().slice(0, 80), role, salt, hash, active: true, mustChange, tokenVersion: 1, createdAt: new Date(now()).toISOString() };
  }

  return {
    enabled, sign, parse, publicUser, log, listUsers, getUser,

    /* the first admin, only when there are no accounts at all */
    async bootstrap() {
      if (!enabled) return false;
      if ((await listUsers()).length) return false;
      const email = normEmail(env.ADMIN_EMAIL), pw = env.ADMIN_PASSWORD;
      if (!emailOk(email) || passwordProblem(pw)) { console.error("sign-in is on but ADMIN_EMAIL and ADMIN_PASSWORD (12 or more characters) are not set, so no first admin was created"); return false; }
      await users.setJSON(email, await newRecord({ email, name: "Administrator", role: "admin", password: pw, mustChange: true }));
      await log("admin_created", email, "first administrator");
      return true;
    },

    async login(emailIn, password, ip) {
      const email = normEmail(emailIn), keys = [email, "ip:" + ip];
      const wait = Math.max(...keys.map(lockedFor));
      if (wait) return { error: "locked", retryMs: wait };
      const u = emailOk(email) ? await getUser(email) : null;
      let ok = false;
      if (u && typeof password === "string") ok = await checkPassword(password, u); else await burn(typeof password === "string" ? password : "");
      if (!ok || u.active === false) { noteFail(email); noteFail("ip:" + ip, 25); await log("login_failed", email, ip); return { error: "bad" }; }
      keys.forEach(clearFails);
      await log("login", email, ip);
      return { user: u };
    },

    /* the signed-in person for this request, or null. renew: more than half the session is gone, so send a fresh cookie. */
    async session(req) {
      if (!enabled) return null;
      const m = /(?:^|;\s*)prism_session=([^;]+)/.exec(req.headers.cookie || "");
      const p = m && parse(m[1]);
      if (!p) return null;
      const u = await getUser(p.e);
      if (!u || u.active === false || u.tokenVersion !== p.v) return null;
      return { ...publicUser(u), tokenVersion: u.tokenVersion, renew: p.x - now() < SESSION_MS / 2 };
    },

    /* the cookie for a signed-in person; secure is true when the request came over HTTPS */
    cookieFor(u, secure) {
      return `${COOKIE}=${sign({ e: u.email, v: u.tokenVersion, x: now() + SESSION_MS })}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? "; Secure" : ""}`;
    },
    clearCookie(secure) { return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`; },

    async changePassword(email, current, next) {
      const u = await getUser(email);
      if (!u || typeof current !== "string" || !(await checkPassword(current, u))) { await log("password_change_failed", normEmail(email), ""); return { error: "The current password is not right." }; }
      const problem = passwordProblem(next);
      if (problem) return { error: problem };
      if (next === current) return { error: "Choose a new password, different from the current one." };
      const { salt, hash } = await hashPassword(next);
      const updated = { ...u, salt, hash, mustChange: false, tokenVersion: (u.tokenVersion || 1) + 1 };
      await users.setJSON(u.email, updated);
      await log("password_changed", u.email, "");
      return { user: updated };
    },

    async createUser({ email: e, name, role }, by) {
      const email = normEmail(e);
      if (!emailOk(email)) return { error: "Enter a valid email address." };
      if (!ROLES.includes(role)) return { error: "Role must be viewer, estimator or admin." };
      if (await getUser(email)) return { error: "That email already has an account." };
      const pw = tempPassword();
      await users.setJSON(email, await newRecord({ email, name, role, password: pw, mustChange: true }));
      await log("user_created", by, `${email} as ${role}`);
      return { user: publicUser(await getUser(email)), tempPassword: pw };
    },

    async updateUser({ email: e, name, role, active }, by) {
      const u = await getUser(e);
      if (!u) return { error: "No such user." };
      const all = await listUsers();
      const next = { ...u };
      if (name !== undefined) next.name = String(name).trim().slice(0, 80);
      if (role !== undefined) { if (!ROLES.includes(role)) return { error: "Role must be viewer, estimator or admin." }; next.role = role; }
      if (active !== undefined) next.active = active === true;
      const lastAdmin = u.role === "admin" && u.active !== false && activeAdmins(all).length === 1;
      if (lastAdmin && (next.role !== "admin" || next.active === false)) return { error: "This is the last active administrator. Make someone else an administrator first." };
      if (next.role !== u.role || next.active !== u.active) next.tokenVersion = (u.tokenVersion || 1) + 1;   /* signs the person out everywhere */
      await users.setJSON(u.email, next);
      await log("user_updated", by, `${u.email}: role ${u.role}->${next.role}, active ${u.active !== false}->${next.active !== false}`);
      return { user: publicUser(next) };
    },

    async resetPassword(e, by) {
      const u = await getUser(e);
      if (!u) return { error: "No such user." };
      const pw = tempPassword(), { salt, hash } = await hashPassword(pw);
      await users.setJSON(u.email, { ...u, salt, hash, mustChange: true, tokenVersion: (u.tokenVersion || 1) + 1 });
      clearFails(u.email);
      await log("password_reset", by, u.email);
      return { tempPassword: pw };
    },

    async recentAudit(limit = 200) {
      const { blobs } = await audit.list({ prefix: "" });
      const keys = blobs.map((b) => b.key).sort().slice(-Math.min(500, Math.max(1, limit))).reverse();
      const out = [];
      for (const k of keys) { const r = await audit.get(k); if (r) out.push(r); }
      return out;
    },
  };
}
