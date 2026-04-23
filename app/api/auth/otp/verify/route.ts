import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { consumeSmsOtp } from '@/lib/auth/otp-store'
import { getUserByPhone, updateUserById } from '@/lib/auth/user-store'
import { createAccessToken } from '@/lib/auth/jwt'
import { issueRefreshToken } from '@/lib/auth/refresh-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const phone = String(body?.phone || '').trim()
    const token = String(body?.token || '').trim()
    if (!/^\+\d{8,15}$/.test(phone)) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_INVALID_PHONE_E164, error: 'phone must be E.164' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'token required' }, { status: 400 })
    }

    const ok = await consumeSmsOtp(phone, token)
    if (!ok) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
    }

    const user = await getUserByPhone(phone)
    if (!user || user.deleted_at) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_PROFILE_MISSING, error: 'user not found' }, { status: 404 })
    }

    const updated = await updateUserById(user.id, { phone_confirm: true })
    if (!updated) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_PROFILE_MISSING, error: 'user not found' }, { status: 404 })
    }

    const access_token = await createAccessToken(updated, null)
    const refresh_token = await issueRefreshToken(updated.id)
    return NextResponse.json({ access_token, refresh_token, user: updated })
  } catch (error) {
    console.error('[api/auth/otp/verify] error:', error)
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' }, { status: 500 })
  }
}
