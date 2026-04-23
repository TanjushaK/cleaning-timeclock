'use client'

import { getAccessToken, getRefreshToken, setAuthTokens, clearAuthTokens } from '@/lib/auth-fetch'
import type { AppUser, AuthChangeEvent } from '@/lib/server/compat/types'

type Session = {
  access_token: string
  refresh_token: string | null
  user: AppUser
}

type Listener = (event: AuthChangeEvent, session: Session | null) => void

const listeners = new Set<Listener>()

function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function currentSession(): Session | null {
  const access = getAccessToken()
  if (!access) return null
  const refresh = getRefreshToken()
  const payload = parseJwtPayload(access)
  if (!payload?.sub) return null
  return {
    access_token: access,
    refresh_token: refresh,
    user: {
      id: String(payload.sub),
      email: payload.email ? String(payload.email) : null,
      phone: payload.phone ? String(payload.phone) : null,
      email_confirmed_at: null,
      phone_confirmed_at: null,
      user_metadata: {},
    },
  }
}

function emit(event: AuthChangeEvent, session: Session | null) {
  for (const listener of listeners) {
    try {
      listener(event, session)
    } catch {
      // ignore
    }
  }
}

async function refreshIfNeeded(): Promise<Session | null> {
  const session = currentSession()
  if (!session) return null
  const payload = parseJwtPayload(session.access_token)
  const exp = Number(payload?.exp || 0)
  if (!exp || exp * 1000 > Date.now() + 10_000) return session
  const refresh = session.refresh_token
  if (!refresh) return null
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.access_token) {
    clearAuthTokens()
    emit('SIGNED_OUT', null)
    return null
  }
  setAuthTokens(String(json.access_token), json.refresh_token ? String(json.refresh_token) : null)
  const next = currentSession()
  emit('TOKEN_REFRESHED', next)
  return next
}

const auth = {
  async setSession(session: { access_token: string; refresh_token: string }) {
    setAuthTokens(session.access_token, session.refresh_token)
    const next = currentSession()
    emit('SIGNED_IN', next)
    return { data: { session: next }, error: null }
  },
  async getSession() {
    const session = await refreshIfNeeded()
    return { data: { session }, error: null }
  },
  async signOut() {
    clearAuthTokens()
    emit('SIGNED_OUT', null)
    return { error: null }
  },
  async signInWithOtp(input: { phone: string; options?: { shouldCreateUser?: boolean } }) {
    const response = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: input.phone }),
    })
    const json = await response.json().catch(() => null)
    return response.ok
      ? { data: json as { ok?: boolean; delivery?: string }, error: null }
      : { data: null, error: { message: json?.error || 'OTP send failed' } }
  },
  async verifyOtp(input: { phone: string; token: string; type: string }) {
    const response = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: input.phone, token: input.token, type: input.type }),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok || !json?.access_token) {
      return { data: null, error: { message: json?.error || 'OTP verify failed' } }
    }
    setAuthTokens(String(json.access_token), json.refresh_token ? String(json.refresh_token) : null)
    const next = currentSession()
    emit('SIGNED_IN', next)
    return { data: { session: next, user: next?.user || null }, error: null }
  },
  async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo: options?.redirectTo || null }),
    })
    const json = await response.json().catch(() => null)
    return response.ok
      ? {
          data: json as { ok?: boolean; delivery?: 'none' | 'dev_log' | 'sent' },
          error: null,
        }
      : { data: null, error: { message: json?.error || 'Recovery failed' } }
  },
  async exchangeCodeForSession(code: string) {
    const response = await fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok || !json?.access_token) {
      return { data: null, error: { message: json?.error || 'Exchange failed' } }
    }
    setAuthTokens(String(json.access_token), json.refresh_token ? String(json.refresh_token) : null)
    const next = currentSession()
    emit('PASSWORD_RECOVERY', next)
    return { data: { session: next }, error: null }
  },
  onAuthStateChange(callback: Listener) {
    listeners.add(callback)
    return {
      data: {
        subscription: {
          unsubscribe: () => listeners.delete(callback),
        },
      },
    }
  },
}

function getBrowserAuthRoot() {
  return { auth }
}

export const appAuth = new Proxy(getBrowserAuthRoot(), {
  get(target, prop, receiver) {
    return Reflect.get(target, prop, receiver)
  },
})
