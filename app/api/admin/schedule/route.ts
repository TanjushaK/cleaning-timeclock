import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function assertAdmin(req: NextRequest) {
  const token = bearer(req)
  if (!token) return { ok: false as const, status: 401, error: 'Нет входа. Авторизуйся в админке.' }

  const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
  const anon = envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false as const, status: 401, error: 'Невалидный токен' }

  const { data: prof, error: profErr } = await sb.from('profiles').select('id, role, active').eq('id', userData.user.id).single()
  if (profErr || !prof) return { ok: false as const, status: 403, error: 'Профиль не найден' }
  if (prof.role !== 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'Доступ запрещён' }

  return { ok: true as const }
}

export async function GET(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const sp = req.nextUrl.searchParams
    const dateFrom = (sp.get('date_from') || '').trim()
    const dateTo = (sp.get('date_to') || '').trim()
    const siteId = (sp.get('site_id') || '').trim()
    const workerId = (sp.get('worker_id') || '').trim()

    if (!dateFrom || !dateTo) return NextResponse.json({ error: 'date_from и date_to обязательны' }, { status: 400 })

    let q = admin
      .from('jobs')
      .select('id,status,job_date,scheduled_time,site_id,worker_id')
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)

    if (siteId) q = q.eq('site_id', siteId)
    if (workerId) q = q.eq('worker_id', workerId)

    const { data: jobs, error: jobsErr } = await q
    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })

    const jobIds = (jobs || []).map((j: any) => j.id)
    const siteIds = Array.from(new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean)))
    const workerIds = Array.from(new Set((jobs || []).map((j: any) => j.worker_id).filter(Boolean)))

    const [sitesRes, workersRes, logsRes] = await Promise.all([
      siteIds.length ? admin.from('sites').select('id,name').in('id', siteIds) : Promise.resolve({ data: [], error: null } as any),
      workerIds.length ? admin.from('profiles').select('id,full_name').in('id', workerIds) : Promise.resolve({ data: [], error: null } as any),
      jobIds.length ? admin.from('time_logs').select('job_id,started_at,stopped_at').in('job_id', jobIds) : Promise.resolve({ data: [], error: null } as any),
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
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
