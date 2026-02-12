import { NextResponse } from 'next/server'
import { ApiError, requireUser } from '@/lib/supabase-server'

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser(req.headers)

    const body = await req.json().catch(() => ({}))
    const avatar_url = typeof body?.avatar_url === 'string' ? body.avatar_url.trim() : ''

    if (!avatar_url) throw new ApiError(400, 'avatar_url_required')

    const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', user.id)
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
