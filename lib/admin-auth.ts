import type { AppUser } from '@/lib/server/compat/types'
import { requireAdmin as requireAdminGuard } from '@/lib/route-db'

export type AdminContext = {
  user: AppUser
  token: string
  adminId: string
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const guard = await requireAdminGuard(request)
  return { user: guard.user, token: guard.token, adminId: guard.userId }
}

export { ApiError } from '@/lib/route-db'
