import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, user, userId } = await requireUser(req)

    const body = await req.json().catch(() => ({} as any))
    const password = String(body?.password ?? '').trim()
    if (password.length < 8) throw new ApiError(400, 'Пароль должен быть минимум 8 символов')

    const currentMeta = ((user as any)?.user_metadata ?? {}) as Record<string, any>
    const nextMeta = { ...currentMeta, temp_password: false }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      user_metadata: nextMeta,
    })

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
