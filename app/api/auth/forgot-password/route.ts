import { NextResponse } from 'next/server'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { getUserByEmail } from '@/lib/auth/user-store'
import { issueRecoveryCode, sendRecoveryEmail } from '@/lib/auth/recovery-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:forgot-password:${ip}`, 15, 60_000)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({} as any))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_INVALID_EMAIL, error: 'Email required' }, { status: 400 })
    }

    const user = await getUserByEmail(email)
    if (!user || user.deleted_at) {
      return NextResponse.json({ ok: true, delivery: 'none' })
    }

    const issued = await issueRecoveryCode(user.id)
    const mode = await sendRecoveryEmail(email, issued.url)

    return NextResponse.json({
      ok: true,
      delivery: mode === 'sent' ? 'sent' : 'dev_log',
    })
  } catch (error) {
    console.error('[api/auth/forgot-password] error:', error)
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' }, { status: 500 })
  }
}
