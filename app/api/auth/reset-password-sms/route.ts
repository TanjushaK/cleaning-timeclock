import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { consumeSmsOtp } from '@/lib/auth/otp-store'
import { consumeRecoveryCode } from '@/lib/auth/recovery-store'
import { getUserByPhone, applyPasswordRecoveryUpdate } from '@/lib/auth/user-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:reset-pw-sms:${ip}`, 20, 60_000)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const password = String(body?.password ?? '').trim()
    const resetToken = String(body?.reset_token ?? '').trim()
    const phone = String(body?.phone ?? '').trim()
    const otpCode = String(body?.code ?? '').trim()

    if (password.length < 8) {
      return NextResponse.json(
        { errorCode: AppApiErrorCodes.PASSWORD_TOO_SHORT, error: 'Password too short' },
        { status: 400 },
      )
    }

    let userId: string | null = null

    if (resetToken) {
      userId = await consumeRecoveryCode(resetToken)
      if (!userId) {
        return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired token' }, { status: 401 })
      }
    } else if (phone && otpCode) {
      if (!isE164(phone) || !/^\d{6}$/.test(otpCode)) {
        return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
      }
      const ok = await consumeSmsOtp(phone, otpCode)
      if (!ok) {
        return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
      }
      const user = await getUserByPhone(phone)
      if (!user || user.deleted_at) {
        return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
      }
      userId = user.id
    } else {
      return NextResponse.json(
        { errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'reset_token or phone+code required' },
        { status: 400 },
      )
    }

    const result = await applyPasswordRecoveryUpdate(userId, password)
    if (result === 'short') {
      return NextResponse.json(
        { errorCode: AppApiErrorCodes.PASSWORD_TOO_SHORT, error: 'Password too short' },
        { status: 400 },
      )
    }
    if (result === 'missing') {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_PROFILE_MISSING, error: 'user not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/auth/reset-password-sms] error:', error)
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' }, { status: 500 })
  }
}
