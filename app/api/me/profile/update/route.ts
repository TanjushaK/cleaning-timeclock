import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as any))

    const full_name = String(body?.full_name || '').trim()
    const email = String(body?.email || '').trim()

    if (!full_name) throw new ApiError(400, 'Укажи имя')

    const patch: any = { full_name }
    if (email) patch.email = email

    // пробуем обновить, если email-колонки нет — всё равно обновим full_name
    const r = await supabase.from('profiles').update(patch).eq('id', userId).select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at').single()
    if (!r.error) return NextResponse.json({ ok: true, profile: r.data })

    const msg = String(r.error.message || '')
    if (email && msg.includes('column') && msg.includes('email')) {
      const r2 = await supabase.from('profiles').update({ full_name }).eq('id', userId).select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at').single()
      if (r2.error) throw new ApiError(400, r2.error.message)
      return NextResponse.json({ ok: true, profile: r2.data, warning: 'email_column_missing' })
    }

    throw new ApiError(400, r.error.message)
  } catch (e) {
    return toErrorResponse(e)
  }
}
