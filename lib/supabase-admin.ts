import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

let _admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  if (!supabaseUrl) throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')

  _admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return _admin
}

// совместимость со старым импортом
export const supabaseAdmin: SupabaseClient = getSupabaseAdmin()
