// Empty in dev (Vite proxies /api). Set VITE_API_URL=https://api.example.com for a split deploy.
const BASE = import.meta.env.VITE_API_URL ?? '';

async function getJson(path, params, signal) {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { signal });
  if (!res.ok) {
    // The API always answers errors as { error: "..." }; surface that text to the user.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
  }
  return res.json();
}

export const fetchWardTrends = (params, signal) => getJson('/api/analytics/ward-trends', params, signal);
export const fetchIncidents = (params, signal) => getJson('/api/incidents', params, signal);
