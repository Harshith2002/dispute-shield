function newSessionId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
}

// One session per browser tab, so two reviewers never overwrite each other's upload.
export const SESSION = (() => {
  try {
    const existing = sessionStorage.getItem("ds-session");
    if (existing) return existing;
    const id = newSessionId();
    sessionStorage.setItem("ds-session", id);
    return id;
  } catch {
    return newSessionId();
  }
})();

async function handle(res) {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export function get(path, params = {}) {
  const q = new URLSearchParams({ session: SESSION, ...params });
  for (const [k, v] of [...q.entries()]) if (v === "" || v === "undefined") q.delete(k);
  return fetch(`/api/${path}?${q}`).then(handle);
}

// Read-only views (history, what-if, team pages) are cached so revisiting a tab shows data instantly
// instead of a loading flash. Any upload clears the cache, since team and reason pages include uploaded data.
const cache = new Map();
const keyOf = (path, params) => `${path}?${JSON.stringify(params)}`;
export const peek = (path, params = {}) => cache.get(keyOf(path, params)) ?? null;
export function getCached(path, params = {}) {
  const k = keyOf(path, params);
  return cache.has(k) ? Promise.resolve(cache.get(k)) : get(path, params).then((v) => (cache.set(k, v), v));
}
export const clearCache = () => cache.clear();

export function upload(path, files) {
  const form = new FormData();
  form.append("session", SESSION);
  for (const [k, f] of Object.entries(files)) if (f) form.append(k, f);
  return fetch(`/api/${path}`, { method: "POST", body: form }).then(handle);
}

export const exportUrl = (name) => `/api/export/${name}.csv?session=${encodeURIComponent(SESSION)}`;

export const pct = (v, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
export const usd = (v, d = 0) =>
  v == null ? "–" : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d });
export const num = (v, d = 0) => (v == null ? "–" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
export const signed = (v, fmt) => (v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v)));
