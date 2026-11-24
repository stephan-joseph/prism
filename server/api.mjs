/* The sign-in and user endpoints. Each handler takes (body, ctx) and returns {status, body, cookie?}.
   ctx = {session, ip, secure}. server.mjs turns the result into a response and enforces who may call what. */

const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
const mine = (s) => ({ email: s.email, name: s.name, role: s.role, mustChange: s.mustChange });

export function authApi({ auth }) {
  return {
    async login(body, ctx) {
      const r = await auth.login(body.email, body.password, ctx.ip);
      if (r.error === "locked") return fail(429, `Too many attempts. Try again in ${Math.max(1, Math.ceil(r.retryMs / 60000))} minutes.`);
      if (r.error) return fail(401, "Wrong email or password.");   /* the same words for an unknown account and a wrong password */
      return { status: 200, body: { user: mine(auth.publicUser(r.user)) }, cookie: auth.cookieFor(r.user, ctx.secure) };
    },
    logout(body, ctx) {
      return { status: 200, body: { ok: true }, cookie: auth.clearCookie(ctx.secure) };
    },
    me(body, ctx) {
      return { status: 200, body: { enabled: auth.enabled, user: ctx.session ? mine(ctx.session) : null } };
    },
    async password(body, ctx) {
      const r = await auth.changePassword(ctx.session.email, body.current, body.next);
      if (r.error) return fail(400, r.error);
      return { status: 200, body: { user: mine(auth.publicUser(r.user)) }, cookie: auth.cookieFor(r.user, ctx.secure) };
    },

    /* administrators only */
    async users() {
      return { status: 200, body: { users: (await auth.listUsers()).map(auth.publicUser) } };
    },
    async createUser(body, ctx) {
      const r = await auth.createUser(body, ctx.session.email);
      return r.error ? fail(400, r.error) : { status: 200, body: r };
    },
    async updateUser(body, ctx) {
      const r = await auth.updateUser(body, ctx.session.email);
      return r.error ? fail(400, r.error) : { status: 200, body: r };
    },
    async resetPassword(body, ctx) {
      const r = await auth.resetPassword(body.email, ctx.session.email);
      return r.error ? fail(400, r.error) : { status: 200, body: r };
    },
    async audit() {
      return { status: 200, body: { events: await auth.recentAudit(200) } };
    },
  };
}
