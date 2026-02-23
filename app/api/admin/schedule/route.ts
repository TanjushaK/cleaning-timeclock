import { NextRequest, NextResponse } from 'next/server' '@supabase/supabase-js' 'nodejs' 'force-dynamic'

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

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
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

export async function GET(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const sp = req.nextUrl.searchParams

    // РЎРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ: UI РјРѕР¶РµС‚ СЃР»Р°С‚СЊ date_from/date_to, Р° СЃС‚Р°СЂС‹Рµ РІРµСЂСЃРёРё вЂ” from/to.
    const rawFrom = (sp.get('date_from') || sp.get('from') || '' 'date_to') || sp.get('to') || '' 'from Рё to РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' 'РќРµРІРµСЂРЅС‹Р№ РґРёР°РїР°Р·РѕРЅ РґР°С‚' }, { status: 400 })

    const dateFrom = rawFrom
    const dateTo = rawTo

    const siteId = (sp.get('site_id') || '' 'worker_id') || '').trim()

    // РЎРјРµРЅР° РґРѕР»Р¶РЅР° РёРјРµС‚СЊ РЅР°С‡Р°Р»Рѕ Рё РєРѕРЅРµС†.
    // Р’ СЂР°Р·РЅС‹С… СЂРµРІРёР·РёСЏС… Р‘Р” РєРѕР»РѕРЅРєР° РєРѕРЅС†Р° РјРѕР¶РµС‚ РЅР°Р·С‹РІР°С‚СЊСЃСЏ РїРѕ-СЂР°Р·РЅРѕРјСѓ,
    // РЅРѕ РІ С‚РµРєСѓС‰РµРј UI РјС‹ РёСЃРїРѕР»СЊР·СѓРµРј scheduled_end_time.
    // РџРѕСЌС‚РѕРјСѓ: РїС‹С‚Р°РµРјСЃСЏ Р·Р°РїСЂРѕСЃРёС‚СЊ scheduled_end_time; РµСЃР»Рё РєРѕР»РѕРЅРєРё РЅРµС‚ вЂ”
    // РїРѕРІС‚РѕСЂСЏРµРј Р·Р°РїСЂРѕСЃ Р±РµР· РЅРµС‘ (UI РїРѕРєР°Р¶РµС‚ С‚РѕР»СЊРєРѕ РЅР°С‡Р°Р»Рѕ).

    const baseSelect = 'id,status,job_date,scheduled_time,site_id,worker_id'

    let q = admin
      .from('jobs')
      .select(`${baseSelect},scheduled_end_time`)
      .gte('job_date' 'job_date' 'site_id' 'worker_id', workerId)

    let jobs: any[] | null = null
    let jobsErr: any = null

    ;({ data: jobs, error: jobsErr } = await q)

    if (jobsErr && String(jobsErr?.message || '').toLowerCase().includes('scheduled_end_time')) {
      let q2 = admin
        .from('jobs')
        .select(baseSelect)
        .gte('job_date' 'job_date' 'site_id' 'worker_id', workerId)

      ;({ data: jobs, error: jobsErr } = await q2)
    }

    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })

    const jobIds = (jobs || []).map((j: any) => j.id)
    const siteIds = Array.from(new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean)))
    const workerIds = Array.from(new Set((jobs || []).map((j: any) => j.worker_id).filter(Boolean)))

    const [sitesRes, workersRes, logsRes] = await Promise.all([
      siteIds.length ? admin.from('sites').select('id,name').in('id' 'profiles').select('id,full_name').in('id' 'time_logs').select('job_id,started_at,stopped_at').in('job_id', jobIds) : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 500 })
    if (workersRes.error) return NextResponse.json({ error: workersRes.error.message }, { status: 500 })
    if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 })

    const siteName = new Map<string, string>()
    for (const s of (sitesRes.data || []) as any[]) siteName.set(s.id, s.name || '')

    const workerName = new Map<string, string>()
    for (const w of (workersRes.data || []) as any[]) workerName.set(w.id, w.full_name || '')

    const logAgg = new Map<string, { started_at: string | null; stopped_at: string | null }>()
    for (const l of (logsRes.data || []) as any[]) {
      const id = String(l.job_id)
      const cur = logAgg.get(id) || { started_at: null, stopped_at: null }
      if (l.started_at) {
        if (!cur.started_at || String(l.started_at) < cur.started_at) cur.started_at = String(l.started_at)
      }
      if (l.stopped_at) {
        if (!cur.stopped_at || String(l.stopped_at) > cur.stopped_at) cur.stopped_at = String(l.stopped_at)
      }
      logAgg.set(id, cur)
    }

    const items = (jobs || []).map((j: any) => {
      const agg = logAgg.get(String(j.id)) || { started_at: null, stopped_at: null }
      return {
        id: String(j.id),
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        scheduled_end_time: (j as any).scheduled_end_time ?? null,
        site_id: j.site_id,
        site_name: j.site_id ? siteName.get(String(j.site_id)) || null : null,
        worker_id: j.worker_id,
        worker_name: j.worker_id ? workerName.get(String(j.worker_id)) || null : null,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
      }
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }, { status: 500 })
  }
}

