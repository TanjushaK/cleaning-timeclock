import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { loginWithPassword } from '@/lib/auth/login-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}

function json(status: number, data: Record<string, unknown>) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:login:${ip}`, 25, 60_000)) {
      return json(429, { errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many login attempts' })
    }

    const body = await req.json().catch(() => ({} as any))
    const identifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '').trim()
    const password = String(body?.password ?? '').trim()

    if (!identifier || !password) {
      return json(400, { errorCode: AppApiErrorCodes.AUTH_IDENTIFIER_PASSWORD_REQUIRED, error: 'identifier and password required' })
    }

    const looksEmail = identifier.includes('@')
    if (looksEmail && !isEmail(identifier)) {
      return json(400, { errorCode: AppApiErrorCodes.AUTH_INVALID_EMAIL, error: 'invalid email' })
    }
    if (!looksEmail && !isE164(identifier)) {
      return json(400, { errorCode: AppApiErrorCodes.AUTH_INVALID_PHONE_E164, error: 'phone must be E.164' })
    }

    const session = await loginWithPassword({
      email: looksEmail ? identifier.toLowerCase() : null,
      phone: looksEmail ? null : identifier,
      password,
      userAgent: req.headers.get('user-agent'),
      ip,
    })

    if (!session) {
      return json(401, { errorCode: AppApiErrorCodes.AUTH_INVALID_CREDENTIALS, error: 'invalid credentials' })
    }

    return json(200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
    })
  } catch (error) {
    const pgCode =
      error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
    if (
      pgCode === '28P01' ||
      pgCode === 'ECONNREFUSED' ||
      pgCode === 'ENOTFOUND' ||
      pgCode === '3D000' ||
      pgCode === '57P03'
    ) {
      console.warn('[api/auth/login] database unavailable (configure DATABASE_URL / npm run db:setup)')
      return json(503, { errorCode: AppApiErrorCodes.DB_UNAVAILABLE, error: 'Database unavailable' })
    }
    console.error('[api/auth/login] error:', error)
    return json(500, { errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' })
  }
}
