import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as any))

    const full_name = String(body?.full_name || '').trim()
    const phone = body?.phone === null ? null : String(body?.phone || '').trim()
    const email = body?.email === null ? null : String(body?.email || '').trim()
    const notes = String(body?.notes ?? '').slice(0, 5000)

    if (!full_name) throw new ApiError(400, 'Укажи имя')

    const patch: any = {
      full_name,
      notes,
      phone: phone ? phone : null,
      email: email ? email : null,
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id, role, active, full_name, phone, email, notes, onboarding_submitted_at, avatar_path')
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true, profile: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}
