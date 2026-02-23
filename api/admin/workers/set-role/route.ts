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
  if (!token) return { ok: false as const, status: 401, error: 'РќРµС‚ РІС…РѕРґР°. РђРІС‚РѕСЂРёР·СѓР№СЃСЏ РІ Р°РґРјРёРЅРєРµ.' 'NEXT_PUBLIC_SUPABASE_URL' 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false as const, status: 401, error: 'РќРµРІР°Р»РёРґРЅС‹Р№ С‚РѕРєРµРЅ' 'profiles').select('id, role, active').eq('id' 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰С‘РЅ' }

  return { ok: true as const, admin_id: userData.user.id }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const workerId = String(body?.worker_id || '' '' 'worker_id РѕР±СЏР·Р°С‚РµР»РµРЅ' 'admin' && role !== 'worker') return NextResponse.json({ error: 'role РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ "admin" РёР»Рё "worker"' 'admin' 'РќРµР»СЊР·СЏ СЂР°Р·Р¶Р°Р»РѕРІР°С‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ.' }, { status: 400 })
    }

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const patch: Record<string, any> = { role }
    if (role === 'admin' 'profiles').update(patch).eq('id', workerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }, { status: 500 })
  }
}

