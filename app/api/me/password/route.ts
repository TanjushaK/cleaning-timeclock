import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, user, userId } = await requireUser(req)

    const body = await req.json().catch(() => ({} as any))
    const password = String(body?.password ?? '' 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РјРёРЅРёРјСѓРј 8 СЃРёРјРІРѕР»РѕРІ')

    const currentMeta = ((user as any)?.user_metadata ?? {}) as Record<string, any>
    const nextMeta = { ...currentMeta, temp_password: false }

    const patch: any = {
      password,
      user_metadata: nextMeta,
    }

    // В«РЎ РѕРґРЅРѕРіРѕ СЂР°Р·Р°В»: РїРѕСЃР»Рµ СЃР±СЂРѕСЃР°/РІСЂРµРјРµРЅРЅРѕРіРѕ РїР°СЂРѕР»СЏ С„РёРєСЃРёСЂСѓРµРј РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РєРѕРЅС‚Р°РєС‚РѕРІ,
    // С‡С‚РѕР±С‹ РІС…РѕРґ РїРѕ email/phone+password РЅРµ РѕС‚РІР°Р»РёРІР°Р»СЃСЏ РёР·-Р·Р° РЅРµРїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅРѕРіРѕ СЃС‚Р°С‚СѓСЃР°.
    if ((user as any)?.email) patch.email_confirm = true
    if ((user as any)?.phone) patch.phone_confirm = true

    const { error } = await supabase.auth.admin.updateUserById(userId, patch)

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

