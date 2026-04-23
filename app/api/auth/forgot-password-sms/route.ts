import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'
import { canonicalPhoneDigits } from '@/lib/auth/phone-canonical'
import { getUserByPhoneWithSource } from '@/lib/auth/user-store'
import { issueSmsOtp, sendSmsCode, type SmsDeliveryMode } from '@/lib/auth/otp-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE164(value: string): boolean {
  return /^\+\d{8,15}$/.test(value)
}

function maskCanon(d: string): string {
  if (!d || d.length < 7) return '***'
  return `${d.slice(0, 4)}…${d.slice(-3)}`
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:forgot-pw-sms:ip:${ip}`, 12, 60_000)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const phone = String(body?.phone ?? '').trim()

    if (!isE164(phone)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_INVALID_PHONE_E164, error: 'phone must be E.164' }, { status: 400 })
    }

    if (!checkRateLimit(`auth:forgot-pw-sms:phone:${phone}`, 5, 3600_000)) {
      return NextResponse.json({ ok: true })
    }

    const canon = canonicalPhoneDigits(phone)
    let lookupSource: 'app_users' | 'profiles' | 'none' = 'none'
    let userFound = false
    let otpInserted = false
    let delivery: SmsDeliveryMode | 'skipped' = 'skipped'
    let sendTwilioSmsCalled = false

    try {
      const { user, source } = await getUserByPhoneWithSource(phone)
      lookupSource = source
      userFound = Boolean(user && !user.deleted_at)

      if (userFound && user) {
        const { code } = await issueSmsOtp(phone)
        otpInserted = true
        delivery = await sendSmsCode(phone, code, 'password_reset')
        sendTwilioSmsCalled = delivery === 'sent'
      }

      console.info('[forgot-password-sms]', {
        normalizedMasked: maskCanon(canon),
        lookupSource,
        userFound,
        otpInserted,
        delivery,
        sendTwilioSmsCalled,
      })
    } catch (e) {
      console.error('[forgot-password-sms] send path error:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/auth/forgot-password-sms] error:', error)
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' }, { status: 500 })
  }
}
