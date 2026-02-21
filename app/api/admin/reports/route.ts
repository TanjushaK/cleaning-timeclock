import { NextResponse } from 'next/server'
import { supabaseService, toErrorResponse } from '@/lib/supabase-server'

type SitePhoto = { path: string; url?: string; created_at?: string | null }

function asDateISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateISO(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function minutesBetween(startISO: string, stopISO: string): number {
  const a = new Date(startISO).getTime()
  const b = new Date(stopISO).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  const diff = Math.max(0, b - a)
  return Math.round(diff / 60000)
}

function normalizePhotos(v: any): SitePhoto[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((p) => p && typeof p === 'object' && typeof (p as any).path === 'string')
    .map((p) => ({
      path: String((p as any).path),
      url: (p as any).url ? String((p as any).url) : undefined,
      created_at: (p as any).created_at ? String((p as any).created_at) : undefined,
    }))
}

async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string } > {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  if (!token) return { ok: false, status: 401, error: 'Нет токена (Authorization: Bearer ...)' }

  const sb = supabaseService()

  const u = await sb.auth.getUser(token)
  const userId = u.data?.user?.id
  if (u.error || !userId) return { ok: false, status: 401, error: 'Токен недействителен' }

  const prof = await sb.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (prof.error) return { ok: false, status: 500, error: prof.error.message }
  if (!prof.data || prof.data.role !== 'admin') return { ok: false, status: 403, error: 'Требуется роль admin' }

  return { ok: true, userId }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const from = url.searchParams.get('from') || ''
    const to = url.searchParams.get('to') || ''

    const fromD = parseDateISO(from)
    const toD = parseDateISO(to)
    if (!fromD || !toD) {
      return NextResponse.json({ error: 'Неверный период (ожидаю YYYY-MM-DD)' }, { status: 400 })
    }
    if (toD.getTime() < fromD.getTime()) {
      return NextResponse.json({ error: 'Период неверный: to < from' }, { status: 400 })
    }

    const adminCheck = await requireAdmin(req)
    if (!adminCheck.ok) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })

    const sb = supabaseService()

    const fromISO = asDateISO(fromD)
    const toISO = asDateISO(toD)

    const jobsRes = await sb
      .from('jobs')
      .select('id, worker_id, site_id, job_date')
      .gte('job_date', fromISO)
      .lte('job_date', toISO)

    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })
    }

    const jobs = (jobsRes.data || []).filter((j: any) => !!j?.id && !!j?.worker_id && !!j?.site_id)

    if (jobs.length === 0) {
      return NextResponse.json({
        from: fromISO,
        to: toISO,
        total_minutes: 0,
        by_worker: [],
        by_site: [],
        entries: [],
      })
    }

    const startAtMin = `${fromISO}T00:00:00.000Z`
    const startAtMax = `${toISO}T23:59:59.999Z`

    const logsRes = await sb
      .from('time_logs')
      .select('job_id, started_at, stopped_at')
      .gte('started_at', startAtMin)
      .lte('started_at', startAtMax)

    if (logsRes.error) {
      return NextResponse.json({ error: logsRes.error.message }, { status: 500 })
    }

    const minutesByJob = new Map<string, number>()
    const logsByJob = new Map<string, { started_at: string; stopped_at: string; minutes: number }[]>()

    for (const l of logsRes.data || []) {
      const jobId = (l as any)?.job_id
      const started = (l as any)?.started_at
      const stopped = (l as any)?.stopped_at
      if (!jobId || !started || !stopped) continue
      const mins = minutesBetween(String(started), String(stopped))
      if (mins <= 0) continue
      const id = String(jobId)
      minutesByJob.set(id, (minutesByJob.get(id) || 0) + mins)
      const arr = logsByJob.get(id) || []
      arr.push({ started_at: String(started), stopped_at: String(stopped), minutes: mins })
      logsByJob.set(id, arr)
    }

    type WorkerAgg = { worker_id: string; minutes: number; jobs_count: number; logged_jobs: number }
    type SiteAgg = { site_id: string; minutes: number; jobs_count: number; logged_jobs: number }

    const workerAgg = new Map<string, WorkerAgg>()
    const siteAgg = new Map<string, SiteAgg>()

    let totalMinutes = 0

    for (const j of jobs as any[]) {
      const jobId = String(j.id)
      const w = String(j.worker_id)
      const s = String(j.site_id)
      const mins = minutesByJob.get(jobId) || 0

      totalMinutes += mins

      const wa = workerAgg.get(w) || { worker_id: w, minutes: 0, jobs_count: 0, logged_jobs: 0 }
      wa.minutes += mins
      wa.jobs_count += 1
      if (mins > 0) wa.logged_jobs += 1
      workerAgg.set(w, wa)

      const sa = siteAgg.get(s) || { site_id: s, minutes: 0, jobs_count: 0, logged_jobs: 0 }
      sa.minutes += mins
      sa.jobs_count += 1
      if (mins > 0) sa.logged_jobs += 1
      siteAgg.set(s, sa)
    }

    const workerIds = Array.from(workerAgg.keys())
    const siteIds = Array.from(siteAgg.keys())

    const [profilesRes, sitesRes] = await Promise.all([
      sb.from('profiles').select('id, full_name, avatar_url').in('id', workerIds),
      sb.from('sites').select('id, name, photos').in('id', siteIds),
    ])

    if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })
    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 500 })

    const profById = new Map<string, { full_name: string | null; avatar_url: string | null }>()
    for (const p of profilesRes.data || []) {
      profById.set(String((p as any).id), {
        full_name: (p as any).full_name ?? null,
        avatar_url: (p as any).avatar_url ?? null,
      })
    }

    const siteById = new Map<string, { name: string | null; avatar_url: string | null }>()
    for (const s of sitesRes.data || []) {
      const photos = normalizePhotos((s as any).photos)
      const avatar_url = photos?.[0]?.url ? String(photos[0].url) : null
      siteById.set(String((s as any).id), { name: (s as any).name ?? null, avatar_url })
    }

    const by_worker = workerIds
      .map((id) => {
        const a = workerAgg.get(id)!
        const p = profById.get(id)
        return {
          worker_id: id,
          worker_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          minutes: a.minutes,
          jobs_count: a.jobs_count,
          logged_jobs: a.logged_jobs,
        }
      })
      .sort((a, b) => b.minutes - a.minutes || String(a.worker_name || '').localeCompare(String(b.worker_name || '')))

    const by_site = siteIds
      .map((id) => {
        const a = siteAgg.get(id)!
        const s = siteById.get(id)
        return {
          site_id: id,
          site_name: s?.name ?? null,
          avatar_url: s?.avatar_url ?? null,
          minutes: a.minutes,
          jobs_count: a.jobs_count,
          logged_jobs: a.logged_jobs,
        }
      })
      .sort((a, b) => b.minutes - a.minutes || String(a.site_name || '').localeCompare(String(b.site_name || '')))

    const entries: any[] = []
    for (const j of jobs as any[]) {
      const jobId = String(j.id)
      const logs = logsByJob.get(jobId) || []
      if (logs.length === 0) continue

      const workerId = String(j.worker_id)
      const siteId = String(j.site_id)
      const worker = profById.get(workerId)
      const site = siteById.get(siteId)

      for (const l of logs) {
        entries.push({
          job_id: jobId,
          job_date: String(j.job_date),
          worker_id: workerId,
          worker_name: worker?.full_name ?? null,
          site_id: siteId,
          site_name: site?.name ?? null,
          started_at: l.started_at,
          stopped_at: l.stopped_at,
          minutes: l.minutes,
        })
      }
    }

    return NextResponse.json({
      from: fromISO,
      to: toISO,
      total_minutes: totalMinutes,
      by_worker,
      by_site,
      entries,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

