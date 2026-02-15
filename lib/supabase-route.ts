// lib/supabase-route.ts
import { cookies } from 'next/headers'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CookieToSet = { name: string; value: string; options: any }

function getEnv(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length ? v : undefined
}

function getSupabaseUrl(): string {
  return getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL') || ''
}

function getSupabaseAnonKey(): string {
  return getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY') || ''
}

function tryParseJson<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

async function extractAccessTokenFromCookies(): Promise<string | null> {
  const store = await cookies()

  // Пытаемся получить полный список cookies (в некоторых версиях есть getAll)
  const all: Array<{ name: string; value: string }> =
    typeof (store as any).getAll === 'function' ? (store as any).getAll() : []

  // 1) Новый формат: sb-<projectRef>-auth-token (JSON)
  for (const c of all) {
    if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) {
      const parsed = tryParseJson<any>(c.value)
      const token =
        parsed?.access_token ||
        parsed?.currentSession?.access_token ||
        parsed?.session?.access_token
      if (typeof token === 'string' && token.length) return token
    }
  }

  // 2) Старые/простые варианты (точечные имена)
  const direct =
    store.get('sb-access-token')?.value ||
    store.get('supabase-access-token')?.value ||
    store.get('access_token')?.value

  if (direct && direct.length) return direct

  // 3) Иногда session лежит целиком JSON в одном cookie
  const sessionJson =
    store.get('supabase-auth-token')?.value || store.get('sb-auth-token')?.value

  if (sessionJson) {
    const parsed = tryParseJson<any>(sessionJson)
    const token = parsed?.access_token || parsed?.[0]?.access_token
    if (typeof token === 'string' && token.length) return token
  }

  return null
}

/**
 * Supabase client для server-side использования в Route Handlers / Server Components.
 * Без @supabase/ssr.
 */
export async function getSupabaseRouteClient(): Promise<SupabaseClient> {
  const url = getSupabaseUrl()
  const anon = getSupabaseAnonKey()

  if (!url || !anon) {
    throw new Error(
      'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL/SUPABASE_ANON_KEY).'
    )
  }

  const accessToken = await extractAccessTokenFromCookies()

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

// back-compat алиас (если где-то импортировали другое имя)
export const createSupabaseRouteClient = getSupabaseRouteClient
