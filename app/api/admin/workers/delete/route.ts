// app/api/admin/workers/delete/route.ts
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
    const workerId = String(body?.worker_id || '' 'worker_id РѕР±СЏР·Р°С‚РµР»РµРЅ' 'NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 0) РЅРµР»СЊР·СЏ СѓРґР°Р»СЏС‚СЊ Р°РґРјРёРЅР°
    const { data: prof, error: profErr } = await admin
      .from('profiles' 'id, role' 'id', workerId)
      .single()

    if (profErr || !prof) return NextResponse.json({ error: 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' 'admin') return NextResponse.json({ error: 'РђРґРјРёРЅР° СѓРґР°Р»РёС‚СЊ РЅРµР»СЊР·СЏ' }, { status: 409 })

    // 1) РµСЃР»Рё РµСЃС‚СЊ time_logs вЂ” Р·Р°РїСЂРµС‚ (СЃРѕС…СЂР°РЅСЏРµРј РѕС‚С‡С‘С‚С‹)
    const { data: logsHit, error: logsErr } = await admin
      .from('time_logs' 'id' 'worker_id', workerId)
      .limit(1)

    if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 })
    if (logsHit && logsHit.length > 0) {
      return NextResponse.json(
        { error: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЂР°Р±РѕС‚РЅРёРєР°: РµСЃС‚СЊ С‚Р°Р№РјР»РѕРіРё. РСЃРїРѕР»СЊР·СѓР№ "РћС‚РєР»СЋС‡РёС‚СЊ" РёР»Рё "РЈРґР°Р»РёС‚СЊ (Р°РЅРѕРЅРёРјРёР·РёСЂРѕРІР°С‚СЊ)".' },
        { status: 409 }
      )
    }

    // 2) РµСЃР»Рё РµСЃС‚СЊ jobs вЂ” С‚РѕР¶Рµ Р·Р°РїСЂРµС‚ (РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ РјРѕРґРµР»Рё РґР°РЅРЅС‹С…)
    const { data: jobsHit, error: jobsErr } = await admin
      .from('jobs' 'id' 'worker_id', workerId)
      .limit(1)

    if (jobsErr) {
      // РµСЃР»Рё РІ СЃС…РµРјРµ РЅРµС‚ worker_id вЂ” РЅРµ РІР°Р»РёРј СѓРґР°Р»РµРЅРёРµ, РїСЂРѕСЃС‚Рѕ РёРґС‘Рј РґР°Р»СЊС€Рµ
    } else if (jobsHit && jobsHit.length > 0) {
      return NextResponse.json(
        { error: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЂР°Р±РѕС‚РЅРёРєР°: РµСЃС‚СЊ СЃРјРµРЅС‹ (РёР»Рё РёСЃС‚РѕСЂРёСЏ СЃРјРµРЅ). РСЃРїРѕР»СЊР·СѓР№ "РћС‚РєР»СЋС‡РёС‚СЊ" РёР»Рё "РЈРґР°Р»РёС‚СЊ (Р°РЅРѕРЅРёРјРёР·РёСЂРѕРІР°С‚СЊ)".' },
        { status: 409 }
      )
    }

    // 3) С‡РёСЃС‚РёРј assignments
    await admin.from('assignments').delete().eq('worker_id', workerId)

    // 4) СѓРґР°Р»СЏРµРј РїСЂРѕС„РёР»СЊ
    const { error: profDelErr } = await admin.from('profiles').delete().eq('id', workerId)
    if (profDelErr) return NextResponse.json({ error: profDelErr.message }, { status: 500 })

    // 5) СѓРґР°Р»СЏРµРј auth user (service role)
    const { error: authDelErr } = await admin.auth.admin.deleteUser(workerId)
    if (authDelErr) {
      return NextResponse.json(
        { error: `РџСЂРѕС„РёР»СЊ СѓРґР°Р»С‘РЅ, РЅРѕ auth user РЅРµ СѓРґР°Р»С‘РЅ: ${authDelErr.message}` },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

