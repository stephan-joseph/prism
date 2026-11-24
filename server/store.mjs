/* Storage for the EKS build. Same three calls the handlers used on Netlify Blobs:
   get(key), setJSON(key, value), list({prefix}).
   Jobs live in memory (dropped after JOB_TTL_MS). Usage records are one JSON file each
   in USAGE_DIR (an emptyDir in k8s, so history is lost when the pod is replaced).
   Needs a single replica. */
import { mkdir, readFile, writeFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

export function memoryStore(ttlMs = 60 * 60 * 1000) {
  const m = new Map();
  const sweep = () => { const now = Date.now(); for (const [k, v] of m) if (now - v.at > ttlMs) m.delete(k); };
  const timer = setInterval(sweep, 5 * 60 * 1000); timer.unref();
  return {
    async get(key) { const v = m.get(key); return v ? v.value : null; },
    async setJSON(key, value) { m.set(key, { at: Date.now(), value }); },
    async delete(key) { return m.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}

const safe = (key) => encodeURIComponent(key); /* keys contain ":" and "/" */

export function fileStore(dir) {
  return {
    async get(key) {
      try { return JSON.parse(await readFile(path.join(dir, safe(key)), "utf8")); } catch { return null; }
    },
    async setJSON(key, value) {
      await mkdir(dir, { recursive: true });
      /* write to a temporary name and rename, so a crash never leaves half a file */
      const f = path.join(dir, safe(key)), tmp = f + ".tmp" + process.pid + "-" + Date.now();
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, f);
    },
    async delete(key) {
      try { await unlink(path.join(dir, safe(key))); return true; } catch { return false; }
    },
    async list({ prefix = "" } = {}) {
      let names = [];
      try { names = await readdir(dir); } catch { /* none yet */ }
      return { blobs: names.filter((n) => !/\.tmp\d+-\d+$/.test(n)).map(decodeURIComponent).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}
