import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiError, requireUser, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { db, user, userId } = await requireUser(req)

    const body = await req.json().catch(() => ({} as any))
    const password = String(body?.password ?? '').trim()

    if (password.length < 8) throw new ApiError(400, 'Password too short', AppApiErrorCodes.PASSWORD_TOO_SHORT)

    const currentMeta = ((user as any)?.user_metadata ?? {}) as Record<string, any>
    const nextMeta = { ...currentMeta, temp_password: false }

    const patch: any = {
      password,
      user_metadata: nextMeta,
    }

    // «С одного раза»: после сброса/временного пароля фиксируем подтверждение контактов,
    // чтобы вход по email/phone+password не отваливался из-за неподтверждённого статуса.
    if ((user as any)?.email) patch.email_confirm = true
    if ((user as any)?.phone) patch.phone_confirm = true

    const { error } = await db.auth.admin.updateUserById(userId, patch)

    if (error) throw new ApiError(400, error.message, AppApiErrorCodes.PASSWORD_UPDATE_FAILED)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
