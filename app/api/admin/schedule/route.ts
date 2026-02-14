import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hhmm(v?: string | null) {
  if (!v) return null
  const m = /^(\d{2}):(\d{2})/.exec(v)
  return m ? `${m[1]}:${m[2]}` : null
}

function addMinutesToHHMM(start: string | null, minutes: number | null) {
  const s = start ? hhmm(start) : null
  if (!s || minutes == null || !Number.isFinite(minutes)) return null
  const [h, m] = s.split(':').map(Number)
  const total = h * 60 + m + Math.max(0, Math.round(minutes))
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req.headers) // проверка роли admin

    const sp = req.nextUrl.searchParams
    const dateFrom = (sp.get('date_from') || '').trim()
    const dateTo = (sp.get('date_to') || '').trim()
    const siteId = (sp.get('site_id') || '').trim()
    const workerId = (sp.get('worker_id') || '').trim()

    if (!dateFrom || !dateTo) throw new ApiError(400, 'date_from и date_to обязательны')

    const { supabase } = await requireAdmin(req.headers)

    let q = supabase
      .from('jobs')
      .select(`
        id,
        status,
        job_date,
        scheduled_time,
        planned_minutes,
        site_id,
        worker_id
      `)
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)

    if (siteId) q = q.eq('site_id', siteId)
    if (workerId) q = q.eq('worker_id', workerId)

    const { data: jobs, error: jobsErr } = await q
    if (jobsErr) throw new ApiError(500, jobsErr.message)

    const jobIds = (jobs || []).map((j: any) => j.id)
    const siteIds = Array.from(new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean)))
    const workerIds = Array.from(new Set((jobs || []).map((j: any) => j.worker_id).filter(Boolean)))

    const [sitesRes, workersRes, logsRes] = await Promise.all([
      siteIds.length
        ? supabase.from('sites').select('id,name,default_minutes,photo_url').in('id', siteIds)
        : Promise.resolve({ data: [], error: null } as any),
      workerIds.length
        ? supabase.from('profiles').select('id,full_name,first_name,last_name,phone,avatar_url').in('id', workerIds)
        : Promise.resolve({ data: [], error: null } as any),
      jobIds.length
        ? supabase.from('time_logs').select('job_id,started_at,stopped_at').in('job_id', jobIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) throw new ApiError(500, sitesRes.error.message)
    if (workersRes.error) throw new ApiError(500, workersRes.error.message)
    if (logsRes.error) throw new ApiError(500, logsRes.error.message)

    const siteMap = new Map<string, any>()
    for (const s of sitesRes.data || []) siteMap.set(String(s.id), s)

    const workerMap = new Map<string, any>()
    for (const w of workersRes.data || []) workerMap.set(String(w.id), w)

    // агрегируем фактические отметки: min(started_at), max(stopped_at)
    const logAgg = new Map<string, { started_at: string | null; stopped_at: string | null }>()
    for (const l of (logsRes.data || []) as any[]) {
      const id = String(l.job_id)
      const cur = logAgg.get(id) || { started_at: null, stopped_at: null }
      if (l.started_at && (!cur.started_at || String(l.started_at) < cur.started_at)) cur.started_at = String(l.started_at)
      if (l.stopped_at && (!cur.stopped_at || String(l.stopped_at) > cur.stopped_at)) cur.stopped_at = String(l.stopped_at)
      logAgg.set(id, cur)
    }

    const items = (jobs || []).map((j: any) => {
      const sid = j.site_id ? String(j.site_id) : null
      const wid = j.worker_id ? String(j.worker_id) : null
      const site = sid ? siteMap.get(sid) : null
      const worker = wid ? workerMap.get(wid) : null

      const plannedMinutes =
        (j.planned_minutes != null ? Number(j.planned_minutes) : null) ??
        (site?.default_minutes != null ? Number(site.default_minutes) : null)

      const startHHMM = hhmm(j.scheduled_time) || null
      const endHHMM = addMinutesToHHMM(j.scheduled_time || null, plannedMinutes)

      const agg = logAgg.get(String(j.id)) || { started_at: null, stopped_at: null }

      return {
        id: String(j.id),
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        planned_minutes: plannedMinutes,
        planned_end_time: endHHMM,
        site_id: sid,
        site_name: site?.name ?? null,
        site_photo_url: site?.photo_url ?? null,
        worker_id: wid,
        worker_name:
          (worker?.first_name || worker?.last_name)
            ? `${worker?.first_name || ''} ${worker?.last_name || ''}`.trim()
            : (worker?.full_name ?? null),
        worker_phone: worker?.phone ?? null,
        worker_avatar_url: worker?.avatar_url ?? null,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
      }
    })

    return NextResponse.json({ items })
  } catch (e) {
    return toErrorResponse(e)
  }
}
