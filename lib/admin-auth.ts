import type { User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type AdminContext = {
  user: User
  token: string
  adminId: string
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const auth = request.headers.get('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()

  if (!token) throw new ApiError(401, 'Нет токена (Authorization: Bearer ...)')

  const supabase = getSupabaseAdmin()

  const { data: u, error: uErr } = await supabase.auth.getUser(token)
  if (uErr || !u.user) throw new ApiError(401, 'Неверный токен')

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', u.user.id)
    .maybeSingle()

  if (profErr || !prof) throw new ApiError(403, 'Нет профиля')
  if (prof.role !== 'admin' || prof.active !== true) throw new ApiError(403, 'Нет доступа')

  return { user: u.user, token, adminId: u.user.id }
}
