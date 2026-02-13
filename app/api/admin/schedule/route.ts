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

function isoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const qp = req.nextUrl.searchParams
    const today = new Date()
    const defFrom = isoDate(today)
    const defTo = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6))

    const dateFrom = (qp.get('date_from') || defFrom).trim()
    const dateTo = (qp.get('date_to') || defTo).trim()
    const siteId = (qp.get('site_id') || '').trim()
    const workerId = (qp.get('worker_id') || '').trim()

    let q = admin
      .from('jobs')
      .select('id,status,site_id,worker_id,job_date,scheduled_time')
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (siteId) q = q.eq('site_id', siteId)
    if (workerId) q = q.eq('worker_id', workerId)

    const { data: jobs, error: jobsErr } = await q
    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })

    const jobList = (jobs ?? []) as any[]
    const siteIds = Array.from(new Set(jobList.map((j) => j.site_id).filter(Boolean)))
    const workerIds = Array.from(new Set(jobList.map((j) => j.worker_id).filter(Boolean)))
    const jobIds = jobList.map((j) => j.id)

    const [sitesRes, profRes, logsRes] = await Promise.all([
      siteIds.length ? admin.from('sites').select('id,name').in('id', siteIds) : Promise.resolve({ data: [] as any[], error: null as any }),
      workerIds.length
        ? admin.from('profiles').select('id,full_name,role,active').in('id', workerIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
      jobIds.length
        ? admin
            .from('time_logs')
            .select('job_id,worker_id,started_at,stopped_at')
            .in('job_id', jobIds)
            .order('started_at', { ascending: false })
        : Promise.resolve({ data: [] as any[], error: null as any }),
    ])

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 500 })
    if (profRes.error) return NextResponse.json({ error: profRes.error.message }, { status: 500 })
    if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 })

    const siteMap = new Map<string, any>((sitesRes.data ?? []).map((s: any) => [s.id, s]))
    const workerMap = new Map<string, any>((profRes.data ?? []).map((p: any) => [p.id, p]))

    // Берём самый свежий лог на пару job_id+worker_id
    const latestLogMap = new Map<string, any>()
    for (const r of logsRes.data ?? []) {
      const key = `${r.job_id}:${r.worker_id || ''}`
      if (!latestLogMap.has(key)) latestLogMap.set(key, r)
    }

    const items = jobList.map((j) => {
      const site = siteMap.get(j.site_id) || null
      const worker = j.worker_id ? workerMap.get(j.worker_id) || null : null
      const log = latestLogMap.get(`${j.id}:${j.worker_id || ''}`) || null

      return {
        id: j.id,
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        site_id: j.site_id,
        site_name: site?.name || null,
        worker_id: j.worker_id,
        worker_name: worker?.full_name || null,
        started_at: log?.started_at || null,
        stopped_at: log?.stopped_at || null,
      }
    })

    return NextResponse.json({ ok: true, date_from: dateFrom, date_to: dateTo, items })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
