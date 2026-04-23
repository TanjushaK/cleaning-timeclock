import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { consumeRecoveryCode } from '@/lib/auth/recovery-store'
import { getUserById } from '@/lib/auth/user-store'
import { createAccessToken } from '@/lib/auth/jwt'
import { issueRefreshToken } from '@/lib/auth/refresh-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const code = String(body?.code || '').trim()
    if (!code) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'code required' }, { status: 400 })
    }

    const userId = await consumeRecoveryCode(code)
    if (!userId) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'invalid or expired code' }, { status: 401 })
    }

    const user = await getUserById(userId)
    if (!user || user.deleted_at) {
      return NextResponse.json({ errorCode: AppApiErrorCodes.AUTH_TOKEN_INVALID, error: 'user not found' }, { status: 401 })
    }

    const publicUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      email_confirmed_at: user.email_confirmed_at,
      phone_confirmed_at: user.phone_confirmed_at,
      user_metadata: user.user_metadata,
      created_at: user.created_at,
      updated_at: user.updated_at,
    }

    const access_token = await createAccessToken(publicUser, null, 'password_recovery')
    const refresh_token = await issueRefreshToken(user.id)

    return NextResponse.json({ access_token, refresh_token, user: publicUser })
  } catch (error) {
    console.error('[api/auth/exchange] error:', error)
    return NextResponse.json({ errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' }, { status: 500 })
  }
}
