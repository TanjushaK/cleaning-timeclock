import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, User } from '@supabase/supabase-js'

type ProfileMini = {
  id: string
  role: string
  active: boolean
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getBearerToken(headers: Headers): string | null {
  const h = headers.get('authorization') || headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!url) throw new ApiError(500, 'SUPABASE_URL_MISSING')
  return url
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!key) throw new ApiError(500, 'SUPABASE_SERVICE_ROLE_KEY_MISSING')
  return key
}

/**
 * Service-role client (Server only):
 * - DB access (bypasses RLS)
 * - Admin Auth API (invite, etc.)
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export async function requireUser(
  headers: Headers
): Promise<{ supabase: SupabaseClient; admin: SupabaseClient; user: User; token: string }> {
  const token = getBearerToken(headers)
  if (!token) throw new ApiError(401, 'UNAUTHORIZED')

  // Один и тот же service-role клиент используем как DB + admin auth api
  const admin = getSupabaseAdmin()
  const supabase = admin

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) throw new ApiError(401, 'UNAUTHORIZED')

  return { supabase, admin, user: data.user, token }
}

export async function requireAdmin(
  headers: Headers
): Promise<{ supabase: SupabaseClient; admin: SupabaseClient; user: User; profile: ProfileMini }> {
  const { supabase, admin, user } = await requireUser(headers)

  const { data: prof, error: pErr } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single()

  if (pErr || !prof) throw new ApiError(403, 'FORBIDDEN')
  if (!prof.active) throw new ApiError(403, 'FORBIDDEN')
  if (prof.role !== 'admin') throw new ApiError(403, 'FORBIDDEN')

  return { supabase, admin, user, profile: prof as ProfileMini }
}
