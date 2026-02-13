import { NextResponse } from 'next/server'
import { ApiError, requireUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function jsonErr(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function PATCH(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req.headers)

    const body = await req.json().catch(() => ({}))
    const avatar_url = typeof body?.avatar_url === 'string' ? body.avatar_url.trim() : ''

    if (!avatar_url) throw new ApiError(400, 'avatar_url обязателен')

    const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', userId)
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    if (e instanceof ApiError) return jsonErr(e.status, e.message)
    return jsonErr(500, e?.message || 'Внутренняя ошибка')
  }
}
