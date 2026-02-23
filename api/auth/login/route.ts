import { NextResponse } from 'next/server' '@supabase/supabase-js' 'nodejs' 'force-dynamic'

function cleanEnv(v: string | undefined | null): string {
  // РЈР±РёСЂР°РµРј BOM (U+FEFF) Рё Р»РёС€РЅРёРµ РїСЂРѕР±РµР»С‹ вЂ” С‡Р°СЃС‚Р°СЏ РїСЂРёС‡РёРЅР° ByteString РѕС€РёР±РѕРє РїРѕСЃР»Рµ copy/paste РІ Vercel
  const s = String(v ?? '').replace(/^\uFEFF/, '').trim()
  // РРЅРѕРіРґР° Vercel/РєРѕРїРёРїР°СЃС‚ РѕСЃС‚Р°РІР»СЏРµС‚ РєР°РІС‹С‡РєРё
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function mustEnv(name: string): string {
  const v = cleanEnv(process.env[name])
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function isE164(s: string): boolean {
  return /^\+\d{8,15}$/.test(s)
}

function json(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))

    // Back-compat: СЂР°РЅСЊС€Рµ СЃР»Р°Р»Рё {email,password}. РўРµРїРµСЂСЊ РїСЂРёРЅРёРјР°РµРј {identifier,password} Рё {phone,password}.
    const identifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '' '' 'Р›РѕРіРёРЅ/РїР°СЂРѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' 'NEXT_PUBLIC_SUPABASE_URL' 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const looksEmail = identifier.includes('@')

    if (looksEmail) {
      if (!isEmail(identifier)) return json(400, { error: 'РќРµРІРµСЂРЅС‹Р№ email' })
      const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.toLowerCase(), password })
      if (error || !data?.session) return json(401, { error: error?.message || 'РќРµРІРµСЂРЅС‹Р№ Р»РѕРіРёРЅ/РїР°СЂРѕР»СЊ' })
      return json(200, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: data.user,
      })
    }

    if (!isE164(identifier)) return json(400, { error: 'РўРµР»РµС„РѕРЅ РЅСѓР¶РµРЅ РІ С„РѕСЂРјР°С‚Рµ E.164, РЅР°РїСЂРёРјРµСЂ +31612345678' })

    const { data, error } = await supabase.auth.signInWithPassword({ phone: identifier, password })
    if (error || !data?.session) return json(401, { error: error?.message || 'РќРµРІРµСЂРЅС‹Р№ Р»РѕРіРёРЅ/РїР°СЂРѕР»СЊ' })

    return json(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    })
  } catch (e: any) {
    // РІР°Р¶РЅС‹Р№ РјРѕРјРµРЅС‚: РѕС‚РґР°С‘Рј СЂРµР°Р»СЊРЅСѓСЋ РїСЂРёС‡РёРЅСѓ, РёРЅР°С‡Рµ СЃР»РѕР¶РЅРѕ РґРµР±Р°Р¶РёС‚СЊ Vercel env
    return json(500, { error: String(e?.message || e) })
  }
}

