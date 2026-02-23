// app/api/admin/sites/delete/route.ts
import { NextRequest, NextResponse } from 'next/server' '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? '').replace(/\uFEFF/g, '' '"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function envOrThrow(name: string) {
  const v = cleanEnv(process.env[name])
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function assertAdmin(req: NextRequest) {
  const token = bearer(req)
  if (!token) return { ok: false as const, status: 401, error: 'РќРµС‚ С‚РѕРєРµРЅР° (Authorization: Bearer ...)' 'NEXT_PUBLIC_SUPABASE_URL' 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false as const, status: 401, error: 'РќРµРІР°Р»РёРґРЅС‹Р№ С‚РѕРєРµРЅ' }

  const { data: prof, error: profErr } = await sb
    .from('profiles' 'id, role, active' 'id', userData.user.id)
    .single()

  if (profErr || !prof) return { ok: false as const, status: 403, error: 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'FORBIDDEN' }

  return { ok: true as const, adminUserId: userData.user.id }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const siteId = String(body?.site_id || '' 'site_id РѕР±СЏР·Р°С‚РµР»РµРЅ' 'NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1) РµСЃР»Рё РµСЃС‚СЊ jobs вЂ” Р·Р°РїСЂРµС‚ (С‡С‚РѕР±С‹ РЅРµ Р»РѕРјР°С‚СЊ РѕС‚С‡С‘С‚С‹)
    const { data: jobsHit, error: jobsErr } = await admin
      .from('jobs' 'id' 'site_id', siteId)
      .limit(1)

    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })
    if (jobsHit && jobsHit.length > 0) {
      return NextResponse.json(
        { error: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚: РµСЃС‚СЊ СЃРјРµРЅС‹ (jobs). Р›СѓС‡С€Рµ Р°СЂС…РёРІРёСЂРѕРІР°С‚СЊ (РµСЃР»Рё РґРѕР±Р°РІРёС€СЊ РїРѕР»Рµ/РјРµС…Р°РЅРёРєСѓ) РёР»Рё РѕС‡РёСЃС‚РёС‚СЊ С‚РµСЃС‚РѕРІС‹Рµ РґР°РЅРЅС‹Рµ.' },
        { status: 409 }
      )
    }

    // 2) С‡РёСЃС‚РёРј assignments
    await admin.from('assignments').delete().eq('site_id', siteId)

    // 3) СѓРґР°Р»СЏРµРј site
    const { error: delErr } = await admin.from('sites').delete().eq('id', siteId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

