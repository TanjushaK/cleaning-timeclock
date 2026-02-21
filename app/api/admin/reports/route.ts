import { NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse } from '@/lib/supabase-server'

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

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  return { bucket }
}

function isUrl(s: string) {
  return /^https?:\/\//i.test(s)
}

async function fetchProfiles(sb: any, workerIds: string[]) {
  // пробуем разные схемы, чтобы не падать, если колонки нет
  const tries = [
    { sel: 'id, full_name, avatar_path', key: 'avatar_path' as const },
    { sel: 'id, full_name, avatar_url', key: 'avatar_url' as const },
    { sel: 'id, full_name, photo_path', key: 'photo_path' as const },
    { sel: 'id, full_name', key: null as const },
  ] as const

  for (const t of tries) {
    const res = await sb.from('profiles').select(t.sel).in('id', workerIds)
    if (!res.error) return { rows: res.data || [], avatarKey: t.key }
    const msg = String(res.error.message || '')
    const missingCol = msg.includes('column') && msg.includes('does not exist')
    if (!missingCol) return { rows: res.data || [], avatarKey: t.key }
  }

  return { rows: [], avatarKey: null as const }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const from = (url.searchParams.get('from') || url.searchParams.get('date_from') || '').trim()
    const to = (url.searchParams.get('to') || url.searchParams.get('date_to') || '').trim()

    const fromD = parseDateISO(from)
    const toD = parseDateISO(to)
    if (!fromD || !toD) {
      return NextResponse.json({ error: 'Неверный период (ожидаю YYYY-MM-DD)' }, { status: 400 })
    }
    if (toD.getTime() < fromD.getTime()) {
      return NextResponse.json({ error: 'Период неверный: to < from' }, { status: 400 })
    }

    const admin = await requireAdmin(req)
    const sb = admin.supabase

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

    const [profilesPack, sitesRes] = await Promise.all([
      fetchProfiles(sb, workerIds),
      sb.from('sites').select('id, name').in('id', siteIds),
    ])

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 500 })

    // --- build avatar urls (signed) ---
    const RAW_WORKER_BUCKET = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'
    const { bucket: WORKER_BUCKET } = parseBucketRef(RAW_WORKER_BUCKET, 'site-photos')
    const ttl = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600') || 3600

    const profById = new Map<string, { full_name: string | null; avatar_ref: string | null }>()
    const needSign: string[] = []

    for (const p of profilesPack.rows as any[]) {
      const id = String(p.id)
      const full_name = (p as any).full_name ?? null

      let ref: string | null = null
      if (profilesPack.avatarKey) {
        const v = (p as any)[profilesPack.avatarKey]
        ref = v ? String(v) : null
      }

      profById.set(id, { full_name, avatar_ref: ref })

      if (ref && !isUrl(ref)) needSign.push(ref)
    }

    const signedByPath = new Map<string, string>()
    const uniqPaths = Array.from(new Set(needSign.filter(Boolean)))
    if (uniqPaths.length) {
      const { data: signed, error: signErr } = await sb.storage.from(WORKER_BUCKET).createSignedUrls(uniqPaths, ttl)
      if (!signErr && Array.isArray(signed)) {
        for (const s of signed as any[]) {
          const p = s?.path ? String(s.path) : ''
          const u = s?.signedUrl ? String(s.signedUrl) : ''
          if (p && u) signedByPath.set(p, u)
        }
      }
    }

    const siteById = new Map<string, { name: string | null }>()
    for (const s of sitesRes.data || []) {
      siteById.set(String((s as any).id), { name: (s as any).name ?? null })
    }

    const by_worker = workerIds
      .map((id) => {
        const a = workerAgg.get(id)!
        const p = profById.get(id)
        const ref = p?.avatar_ref ?? null
        const avatar_url = ref ? (isUrl(ref) ? ref : signedByPath.get(ref) || null) : null

        return {
          worker_id: id,
          worker_name: p?.full_name ?? null,
          avatar_url, // <-- UI "Отчёты по работникам" ждёт это поле
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
