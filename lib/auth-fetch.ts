'use client';

type AnyJson = Record<string, any>;

const LS_ACCESS = 'ct_access_token';
const LS_REFRESH = 'ct_refresh_token';

function sanitizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = String(raw).replace(/^\uFEFF/, '').trim();
  t = t.replace(/[^A-Za-z0-9._-]/g, '');
  return t.length ? t : null;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return sanitizeToken(window.localStorage.getItem(LS_ACCESS)); } catch { return null; }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return sanitizeToken(window.localStorage.getItem(LS_REFRESH)); } catch { return null; }
}

export function setAuthTokens(accessToken: string, refreshToken?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const at = sanitizeToken(accessToken);
    const rt = sanitizeToken(refreshToken ?? null);
    if (at) window.localStorage.setItem(LS_ACCESS, at); else window.localStorage.removeItem(LS_ACCESS);
    if (rt) window.localStorage.setItem(LS_REFRESH, rt); else window.localStorage.removeItem(LS_REFRESH);
  } catch {}
}

export function clearAuthTokens() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LS_ACCESS);
    window.localStorage.removeItem(LS_REFRESH);
  } catch {}
}

function buildAuthHeaders(existing?: HeadersInit, accessOverride?: string | null): HeadersInit {
  const token = accessOverride ?? getAccessToken();
  const headers: Record<string, string> = {};

  if (existing) {
    if (existing instanceof Headers) existing.forEach((v, k) => (headers[k] = v));
    else if (Array.isArray(existing)) for (const [k, v] of existing) headers[String(k)] = String(v);
    else for (const [k, v] of Object.entries(existing)) headers[k] = String(v);
  }

  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function refreshViaApi(refreshToken: string): Promise<{ access_token: string; refresh_token: string | null } | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const j = (await res.json().catch(() => null)) as any;
    if (!res.ok || !j?.access_token) return null;

    const at = sanitizeToken(String(j.access_token));
    const rt = sanitizeToken(j.refresh_token ? String(j.refresh_token) : null);
    if (!at) return null;

    setAuthTokens(at, rt);
    return { access_token: at, refresh_token: rt };
  } catch {
    return null;
  }
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Global in-flight counter (debug/guard for stuck UI spinners)
  if (typeof window !== 'undefined') {
    (window as any).__ct_inflight = ((window as any).__ct_inflight ?? 0) + 1;
  }
  try {

  const rt = getRefreshToken();

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers: buildAuthHeaders(init?.headers) });
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (msg.includes('ByteString') || msg.includes('65279') || msg.includes('FEFF')) clearAuthTokens();
    throw e;
  }

  if (res.status !== 401) return res;

  if (!rt) { clearAuthTokens(); return res; }

  const refreshed = await refreshViaApi(rt);
  if (!refreshed?.access_token) { clearAuthTokens(); return res; }

  const res2 = await fetch(input, { ...init, headers: buildAuthHeaders(init?.headers, refreshed.access_token) });
  if (res2.status === 401) clearAuthTokens();
  return res2;
  } finally {
    if (typeof window !== 'undefined') {
      const n = ((window as any).__ct_inflight ?? 1) - 1;
      (window as any).__ct_inflight = n < 0 ? 0 : n;
    }
  }

}

export async function authFetchJson<T = AnyJson>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await authFetch(input, init);

  const ct = res.headers.get('content-type') || '';
  let payload: any = null;

  if (ct.includes('application/json')) payload = await res.json().catch(() => null);
  else payload = await res.text().catch(() => null);

  if (!res.ok) {
    const msg =
      (payload && (payload.error || payload.message)) ||
      (typeof payload === 'string' && payload.trim()) ||
      `HTTP ${res.status}`;
    throw new Error(String(msg));
  }

  return payload as T;
}
