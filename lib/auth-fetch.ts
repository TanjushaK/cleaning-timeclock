'use client';

type AnyJson = Record<string, any>;

// LocalStorage keys (ASCII only)
const LS_ACCESS = 'ct_access_token';
const LS_REFRESH = 'ct_refresh_token';

/**
 * Some environments / copy-pastes may inject BOM (U+FEFF) or other non-ASCII chars.
 * Browser Headers require ByteString (0..255). JWT must be ASCII.
 */
function sanitizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Remove BOM at start and trim whitespace
  let t = String(raw).replace(/^\uFEFF/, '').trim();

  // Keep only JWT-safe characters (base64url + dot separators)
  // JWT: header.payload.signature (A-Z a-z 0-9 _ - .)
  t = t.replace(/[^A-Za-z0-9._-]/g, '');

  return t.length ? t : null;
}

/**
 * Returns cached access token from localStorage (client-side only).
 * This is intentionally synchronous because pages use it in useEffect guards.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sanitizeToken(window.localStorage.getItem(LS_ACCESS));
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sanitizeToken(window.localStorage.getItem(LS_REFRESH));
  } catch {
    return null;
  }
}

/**
 * Save access/refresh tokens after successful /api/auth/login
 */
export function setAuthTokens(accessToken: string, refreshToken?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const safeAccess = sanitizeToken(accessToken);
    const safeRefresh = sanitizeToken(refreshToken ?? null);

    if (safeAccess) window.localStorage.setItem(LS_ACCESS, safeAccess);
    else window.localStorage.removeItem(LS_ACCESS);

    if (safeRefresh) window.localStorage.setItem(LS_REFRESH, safeRefresh);
    else window.localStorage.removeItem(LS_REFRESH);
  } catch {
    // ignore storage errors (private mode etc.)
  }
}

/**
 * Clear tokens (logout / session invalid)
 */
export function clearAuthTokens() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LS_ACCESS);
    window.localStorage.removeItem(LS_REFRESH);
  } catch {
    // ignore
  }
}

function buildAuthHeaders(existing?: HeadersInit): HeadersInit {
  const token = getAccessToken();
  const headers: Record<string, string> = {};

  // Copy existing headers safely
  if (existing) {
    if (existing instanceof Headers) {
      existing.forEach((v, k) => (headers[k] = v));
    } else if (Array.isArray(existing)) {
      for (const [k, v] of existing) headers[String(k)] = String(v);
    } else {
      for (const [k, v] of Object.entries(existing)) headers[k] = String(v);
    }
  }

  // Only add Authorization if token is clean
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function authFetchJson<T = AnyJson>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(input, {
      ...init,
      headers: buildAuthHeaders(init?.headers),
    });
  } catch (e: any) {
    // If something still goes wrong with headers/token, nuke tokens to recover
    const msg = String(e?.message || e || '');
    if (msg.includes('ByteString') || msg.includes('65279') || msg.includes('FEFF')) {
      clearAuthTokens();
    }
    throw e;
  }

  if (res.status === 401) {
    // token invalid → wipe to force re-login
    clearAuthTokens();
  }

  // Friendly errors (keep payload if any)
  const ct = res.headers.get('content-type') || '';
  let payload: any = null;
  if (ct.includes('application/json')) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      payload = await res.text();
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const msg =
      (payload && (payload.error || payload.message)) ||
      (typeof payload === 'string' && payload.trim()) ||
      `HTTP ${res.status}`;
    throw new Error(String(msg));
  }

  return payload as T;
}