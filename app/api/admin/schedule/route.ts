import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? '').replace(/\uFEFF/g, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
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

    // Совместимость: UI может слать date_from/date_to, а старые версии — from/to.
    const rawFrom = (sp.get('date_from') || sp.get('from') || '').trim()
    const rawTo = (sp.get('date_to') || sp.get('to') || '').trim()

    if (!rawFrom || !rawTo) return NextResponse.json({ error: 'from и to обязательны' }, { status: 400 })
    if (!isISODate(rawFrom) || !isISODate(rawTo)) return NextResponse.json({ error: 'Неверный диапазон дат' }, { status: 400 })

    const dateFrom = rawFrom
    const dateTo = rawTo

    const siteId = (sp.get('site_id') || '').trim()
    const workerId = (sp.get('worker_id') || '').trim()

    // Смена должна иметь начало и конец.
    // В разных ревизиях БД колонка конца может называться по-разному,
    // но в текущем UI мы используем scheduled_end_time.
    // Поэтому: пытаемся запросить scheduled_end_time; если колонки нет —
    // повторяем запрос без неё (UI покажет только начало).

    const baseSelect = 'id,status,job_date,scheduled_time,site_id,worker_id'

    let q = admin
      .from('jobs')
      .select(`${baseSelect},scheduled_end_time`)
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)

    if (siteId) q = q.eq('site_id', siteId)
    if (workerId) q = q.eq('worker_id', workerId)

    let jobs: any[] | null = null
    let jobsErr: any = null

    ;({ data: jobs, error: jobsErr } = await q)

    if (jobsErr && String(jobsErr?.message || '').toLowerCase().includes('scheduled_end_time')) {
      let q2 = admin
        .from('jobs')
        .select(baseSelect)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)

      if (siteId) q2 = q2.eq('site_id', siteId)
      if (workerId) q2 = q2.eq('worker_id', workerId)

      ;({ data: jobs, error: jobsErr } = await q2)
    }

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
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
