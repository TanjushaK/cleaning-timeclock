import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    const { data: prof, error } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, avatar_path, onboarding_submitted_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw new ApiError(400, error.message)
    if (!prof) throw new ApiError(404, 'Профиль не найден')

    const full = String((prof as any).full_name || '').trim()
    const avatar = String((prof as any).avatar_path || '').trim()

    if (!full) throw new ApiError(400, 'Заполни имя')
    if (!avatar) throw new ApiError(400, 'Поставь аватар (главное фото)')

    const patch: any = {
      active: false,
      onboarding_submitted_at: new Date().toISOString(),
    }

    const r = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at')
      .single()

    if (r.error) throw new ApiError(400, r.error.message)

    return NextResponse.json({ ok: true, profile: r.data })
  } catch (e) {
    return toErrorResponse(e)
  }
}
