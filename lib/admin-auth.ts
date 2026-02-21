import type { User } from '@supabase/supabase-js'
import { requireAdmin as requireAdminGuard } from '@/lib/supabase-server'

export type AdminContext = {
  user: User
  token: string
  adminId: string
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const g = await requireAdminGuard(request)
  return { user: g.user, token: g.token, adminId: g.userId }
}

export { ApiError } from '@/lib/supabase-server'
