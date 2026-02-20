import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function cleanEnv(v: string): string {
  const s = String(v || '').replace(/\uFEFF/g, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function mustEnv(name: string): string {
  const raw = process.env[name]
  const v = cleanEnv(raw || '')
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

let _admin: SupabaseClient | null = null

// ВАЖНО: export именно с этим именем — его импортят routes (archive/anonymize/toggle-active и т.д.)
export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY')
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}