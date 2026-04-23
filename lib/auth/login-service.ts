import type { AppUser, AuthSession } from '@/lib/server/compat/types'
import { createAccessToken } from '@/lib/auth/jwt'
import { issueRefreshToken } from '@/lib/auth/refresh-store'
import { getUserByEmail, getUserById, getUserByPhone, type StoredUser } from '@/lib/auth/user-store'
import { verifyPassword } from '@/lib/auth/password'
import { clientIpFromRequest } from '@/lib/rate-limit'

function toPublicUser(user: StoredUser): AppUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    email_confirmed_at: user.email_confirmed_at,
    phone_confirmed_at: user.phone_confirmed_at,
    user_metadata: user.user_metadata,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}

export async function loginWithPassword(input: {
  email?: string | null
  phone?: string | null
  password: string
  userAgent?: string | null
  ip?: string | null
}): Promise<AuthSession | null> {
  const user = input.email ? await getUserByEmail(input.email) : input.phone ? await getUserByPhone(input.phone) : null
  if (!user || user.deleted_at) return null
  const ok = await verifyPassword(input.password, user.password_hash)
  if (!ok) return null
  const profile = await getUserById(user.id)
  if (!profile || profile.deleted_at) return null
  const access_token = await createAccessToken(toPublicUser(profile), null)
  const refresh_token = await issueRefreshToken(profile.id, { userAgent: input.userAgent, ip: input.ip })
  return { access_token, refresh_token, user: toPublicUser(profile) }
}

export async function refreshAuthSession(refreshToken: string, request?: Request): Promise<AuthSession | null> {
  const { consumeRefreshToken } = await import('@/lib/auth/refresh-store')
  const consumed = await consumeRefreshToken(refreshToken)
  if (!consumed) return null
  const user = await getUserById(consumed.user_id)
  if (!user || user.deleted_at) return null
  const publicUser = toPublicUser(user)
  const access_token = await createAccessToken(publicUser, null)
  const refresh_token = await issueRefreshToken(user.id, {
    userAgent: request?.headers.get('user-agent'),
    ip: request ? clientIpFromRequest(request) : null,
  })
  return { access_token, refresh_token, user: publicUser }
}
