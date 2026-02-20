'use client';

type AnyJson = Record<string, any>;

// LocalStorage keys (ASCII only)
const LS_ACCESS = 'ct_access_token';
const LS_REFRESH = 'ct_refresh_token';

/**
 * Returns cached access token from localStorage (client-side only).
 * This is intentionally synchronous because pages use it in useEffect guards.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LS_ACCESS);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LS_REFRESH);
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
    window.localStorage.setItem(LS_ACCESS, accessToken);
    if (refreshToken) window.localStorage.setItem(LS_REFRESH, refreshToken);
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

  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function authFetchJson<T = AnyJson>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: buildAuthHeaders(init?.headers),
  });

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
