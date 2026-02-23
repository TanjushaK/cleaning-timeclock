import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    const { data: prof, error } = await supabase
      .from('profiles' 'id, role, active, full_name, avatar_path, onboarding_submitted_at' 'id', userId)
      .maybeSingle()

    if (error) throw new ApiError(400, error.message)
    if (!prof) throw new ApiError(404, 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' '' '' 'Р—Р°РїРѕР»РЅРё РёРјСЏ' 'РџРѕСЃС‚Р°РІСЊ Р°РІР°С‚Р°СЂ (РіР»Р°РІРЅРѕРµ С„РѕС‚Рѕ)')

    const patch: any = {
      active: false,
      onboarding_submitted_at: new Date().toISOString(),
    }

    const r = await supabase
      .from('profiles')
      .update(patch)
      .eq('id' 'id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at')
      .single()

    if (r.error) throw new ApiError(400, r.error.message)

    return NextResponse.json({ ok: true, profile: r.data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

