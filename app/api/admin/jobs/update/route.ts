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

  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))

    const jobId = String(body?.job_id || '' 'job_id РѕР±СЏР·Р°С‚РµР»РµРЅ' }, { status: 400 })

    const patch: Record<string, any> = {}

    if (body?.site_id != null) patch.site_id = String(body.site_id).trim() || null
    if (body?.worker_id != null) patch.worker_id = String(body.worker_id).trim() || null
    if (body?.job_date != null) patch.job_date = String(body.job_date).trim() || null
    if (body?.scheduled_time != null) {
      const t = String(body.scheduled_time).trim()
      patch.scheduled_time = t ? (t.length === 5 ? `${t}:00` : t) : null
    }
    if (body?.status != null) patch.status = String(body.status).trim() || null

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'РќРµС‡РµРіРѕ РѕР±РЅРѕРІР»СЏС‚СЊ' 'NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: logs, error: logsErr } = await admin.from('time_logs').select('id').eq('job_id', jobId).limit(1)
    if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 })

    const hasLogs = Array.isArray(logs) && logs.length > 0

    if (hasLogs) {
      if (patch.worker_id != null && patch.worker_id !== undefined) {
        return NextResponse.json({ error: 'РќРµР»СЊР·СЏ СЃРјРµРЅРёС‚СЊ СЂР°Р±РѕС‚РЅРёРєР°: РїРѕ СЃРјРµРЅРµ СѓР¶Рµ РµСЃС‚СЊ РѕС‚РјРµС‚РєРё РІСЂРµРјРµРЅРё.' }, { status: 400 })
      }
      if (patch.site_id != null && patch.site_id !== undefined) {
        return NextResponse.json({ error: 'РќРµР»СЊР·СЏ СЃРјРµРЅРёС‚СЊ РѕР±СЉРµРєС‚: РїРѕ СЃРјРµРЅРµ СѓР¶Рµ РµСЃС‚СЊ РѕС‚РјРµС‚РєРё РІСЂРµРјРµРЅРё.' }, { status: 400 })
      }
      if (patch.job_date != null && patch.job_date !== undefined) {
        return NextResponse.json({ error: 'РќРµР»СЊР·СЏ СЃРјРµРЅРёС‚СЊ РґР°С‚Сѓ: РїРѕ СЃРјРµРЅРµ СѓР¶Рµ РµСЃС‚СЊ РѕС‚РјРµС‚РєРё РІСЂРµРјРµРЅРё.' }, { status: 400 })
      }
      if (patch.scheduled_time != null && patch.scheduled_time !== undefined) {
        return NextResponse.json({ error: 'РќРµР»СЊР·СЏ СЃРјРµРЅРёС‚СЊ РІСЂРµРјСЏ: РїРѕ СЃРјРµРЅРµ СѓР¶Рµ РµСЃС‚СЊ РѕС‚РјРµС‚РєРё РІСЂРµРјРµРЅРё.' }, { status: 400 })
      }
    }

    const { error } = await admin.from('jobs').update(patch).eq('id', jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }, { status: 500 })
  }
}

