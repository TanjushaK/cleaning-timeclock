import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { consumeSmsOtp } from '@/lib/auth/otp-store'
import { getUserByPhone } from '@/lib/auth/user-store'
import { issueRecoveryCode } from '@/lib/auth/recovery-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:verify-reset-sms:${ip}`, 25, 60_000)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const phone = String(body?.phone ?? '').trim()
    const code = String(body?.code ?? '').trim()

    if (!isE164(phone)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_INVALID_PHONE_E164, error: 'phone must be E.164' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
    }

    const ok = await consumeSmsOtp(phone, code)
    if (!ok) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
    }

    const user = await getUserByPhone(phone)
    if (!user || user.deleted_at) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
    }

    const issued = await issueRecoveryCode(user.id)

    return NextResponse.json({
      ok: true,
      reset_token: issued.code,
    })
  } catch (error) {
    console.error('[api/auth/verify-reset-sms] error:', error)
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' }, { status: 500 })
  }
}
