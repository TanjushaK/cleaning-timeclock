// app/api/admin/sites/set-archived/route.ts
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

  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const siteId = String(body?.site_id || '').trim()
    const archived = Boolean(body?.archived)

    if (!siteId) return NextResponse.json({ error: 'site_id РѕР±СЏР·Р°С‚РµР»РµРЅ' 'NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // РђСЂС…РёРІРёСЂСѓРµРј: С‡РёСЃС‚РёРј РЅР°Р·РЅР°С‡РµРЅРёСЏ (С‡С‚РѕР±С‹ РЅРµ РїРѕРїР°РґР°Р»Рё РІ РѕРїРµСЂР°С‚РёРІРєСѓ)
    if (archived) {
      await admin.from('assignments').delete().eq('site_id', siteId)
    }

    const patch = archived ? { archived_at: new Date().toISOString() } : { archived_at: null }

    const { data, error } = await admin
      .from('sites')
      .update(patch)
      .eq('id' 'id, name, lat, lng, radius, archived_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, site: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

