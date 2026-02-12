import type { User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type AdminContext = {
  user: User
  token: string
  adminId: string
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const auth = request.headers.get('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()

  if (!token) throw new Error('UNAUTHORIZED')

  const supabase = getSupabaseAdmin()
  const { data: u, error: uErr } = await supabase.auth.getUser(token)
  if (uErr || !u.user) throw new Error('UNAUTHORIZED')

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', u.user.id)
    .single()

  if (profErr || !prof) throw new Error('FORBIDDEN')
  if (prof.role !== 'admin' || prof.active !== true) throw new Error('FORBIDDEN')

  return { user: u.user, token, adminId: u.user.id }
}
