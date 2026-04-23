import { SignJWT, jwtVerify } from 'jose'
import { accessTokenTtlSeconds, jwtSecret } from '@/lib/server/env'
import type { AppUser } from '@/lib/server/compat/types'

const encoder = new TextEncoder()

export type AccessTokenPayload = {
  sub: string
  role: string | null
  email: string | null
  phone: string | null
  purpose?: 'access' | 'password_recovery'
}

function key() {
  return encoder.encode(jwtSecret())
}

export async function createAccessToken(user: AppUser, role: string | null, purpose: 'access' | 'password_recovery' = 'access'): Promise<string> {
  return await new SignJWT({
    role,
    email: user.email,
    phone: user.phone,
    purpose,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${accessTokenTtlSeconds()}s`)
    .sign(key())
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, key())
  return {
    sub: String(payload.sub || ''),
    role: payload.role ? String(payload.role) : null,
    email: payload.email ? String(payload.email) : null,
    phone: payload.phone ? String(payload.phone) : null,
    purpose: payload.purpose === 'password_recovery' ? 'password_recovery' : 'access',
  }
}
