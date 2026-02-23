// app/api/admin/workers/anonymize/route.ts
import { NextRequest, NextResponse } from 'next/server' '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const workerId = String(body?.worker_id || '' 'worker_id РѕР±СЏР·Р°С‚РµР»РµРЅ')

    if (workerId === guard.userId) {
      throw new ApiError(409, 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ.')
    }

    const admin = supabaseService()

    // 0) РЅРµР»СЊР·СЏ С‚СЂРѕРіР°С‚СЊ Р°РґРјРёРЅР°
    const { data: prof, error: profErr } = await admin
      .from('profiles' 'id, role' 'id', workerId)
      .maybeSingle()

    if (profErr || !prof) throw new ApiError(404, 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' 'admin') throw new ApiError(409, 'РђРґРјРёРЅР° СѓРґР°Р»РёС‚СЊ РЅРµР»СЊР·СЏ')

    // 1) СЃРЅРёРјР°РµРј РЅР°Р·РЅР°С‡РµРЅРёСЏ (РѕР±СЉРµРєС‚С‹)
    const { error: asErr } = await admin.from('assignments').delete().eq('worker_id', workerId)
    if (asErr) throw new ApiError(500, asErr.message)

    // 2) Р°РЅРѕРЅРёРјРёР·РёСЂСѓРµРј РїСЂРѕС„РёР»СЊ (РёСЃС‚РѕСЂРёСЏ СЃРјРµРЅ/С‚Р°Р№РјР»РѕРіРѕРІ РѕСЃС‚Р°РЅРµС‚СЃСЏ)
    const patch: any = {
      active: false,
      role: 'worker' 'РЈРґР°Р»С‘РЅРЅС‹Р№ СЂР°Р±РѕС‚РЅРёРє',
      phone: null,
      avatar_url: null,
    }

    const { error: updErr } = await admin.from('profiles').update(patch).eq('id', workerId)
    if (updErr) throw new ApiError(500, updErr.message)

    // 3) СѓРґР°Р»СЏРµРј auth user (РѕС‚Р·С‹РІР°РµРј РґРѕСЃС‚СѓРї). Р•СЃР»Рё СѓР¶Рµ СѓРґР°Р»С‘РЅ вЂ” СЃС‡РёС‚Р°РµРј СѓСЃРїРµС…РѕРј.
    const { error: authErr } = await admin.auth.admin.deleteUser(workerId)
    if (authErr) {
      const msg = String(authErr.message || '')
      const notFound = /not\s*found/i.test(msg) || /User\s*not\s*found/i.test(msg)
      if (!notFound) {
        return NextResponse.json(
          { ok: true, warning: `РџСЂРѕС„РёР»СЊ Р°РЅРѕРЅРёРјРёР·РёСЂРѕРІР°РЅ, РЅРѕ auth user РЅРµ СѓРґР°Р»С‘РЅ: ${msg}` },
          { status: 200 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}

