// lib/supabase-admin.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SERVICE

  return { url, serviceKey }
}

/**
 * Admin (service role) Supabase client.
 * Используется ТОЛЬКО на сервере (App Routes / server utils).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const { url, serviceKey } = readEnv()
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)')
  if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')

  _client = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return _client
}

/**
 * Back-compat: некоторые файлы импортируют { supabaseAdmin }.
 * Делаем ленивый доступ через Proxy, чтобы не падать на import-time,
 * если env не подхвачен во время build (упадёт только при реальном использовании).
 */
export const supabaseAdmin: SupabaseClient = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'then') return undefined // защита от "thenable"
      const c: any = getSupabaseAdmin()
      return c[prop]
    },
  }
) as unknown as SupabaseClient
