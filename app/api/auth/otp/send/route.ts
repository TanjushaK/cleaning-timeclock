import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { issueSmsOtp, sendSmsCode } from '@/lib/auth/otp-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:otp-send:${ip}`, 10, 60_000)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({} as any))
    const phone = String(body?.phone || '').trim()
    if (!/^\+\d{8,15}$/.test(phone)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_INVALID_PHONE_E164, error: 'phone must be E.164' }, { status: 400 })
    }

    const { code } = await issueSmsOtp(phone)
    const delivery = await sendSmsCode(phone, code)
    return NextResponse.json({
      ok: true,
      delivery: delivery === 'sent' ? 'sent' : 'dev_log',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OTP send failed'
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: message }, { status: 500 })
  }
}
