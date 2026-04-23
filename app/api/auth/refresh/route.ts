import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { refreshAuthSession } from '@/lib/auth/login-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(status: number, data: Record<string, unknown>) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:refresh:${ip}`, 60, 60_000)) {
      return json(429, { errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many refresh requests' })
    }

    const body = await req.json().catch(() => ({} as any))
    const refresh_token = String(body?.refresh_token || '').trim()
    if (!refresh_token) {
      return json(400, { errorCode: AppApiErrorCodes.AUTH_REFRESH_TOKEN_REQUIRED, error: 'refresh_token required' })
    }

    const session = await refreshAuthSession(refresh_token, req)
    if (!session) {
      return json(401, { errorCode: AppApiErrorCodes.AUTH_SESSION_REFRESH_FAILED, error: 'session refresh failed' })
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
      console.warn('[api/auth/refresh] database unavailable (configure DATABASE_URL / npm run db:setup)')
      return json(503, { errorCode: AppApiErrorCodes.DB_UNAVAILABLE, error: 'Database unavailable' })
    }
    console.error('[api/auth/refresh] error:', error)
    return json(500, { errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' })
  }
}
