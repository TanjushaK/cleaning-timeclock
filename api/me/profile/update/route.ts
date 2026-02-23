import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as any))

    const full_name = String(body?.full_name || '' '' '' '' 'РЈРєР°Р¶Рё РёРјСЏ')

    const patch: any = {
      full_name,
      notes,
      phone: phone ? phone : null,
      email: email ? email : null,
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id' 'id, role, active, full_name, phone, email, notes, onboarding_submitted_at, avatar_path')
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true, profile: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

