import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { localPhotoBucket } from '@/lib/server/local-photo-storage'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

function truthy(v: string | undefined | null) {
  if (!v) return false
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())
}

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

function spanMinutes(logs: LogItem[]): number {
  let minStart = Number.POSITIVE_INFINITY
  let maxStop = Number.NEGATIVE_INFINITY
  for (const l of logs) {
    const a = new Date(l.started_at).getTime()
    const b = new Date(l.stopped_at).getTime()
    if (Number.isFinite(a)) minStart = Math.min(minStart, a)
    if (Number.isFinite(b)) maxStop = Math.max(maxStop, b)
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxStop) || maxStop <= minStart) return 0
  return Math.round((maxStop - minStart) / 60000)
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

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path' | null

type JobRow = {
  id: string
  worker_id: string | null
  site_id: string | null
  job_date: string | null
  scheduled_time?: string | null
  scheduled_end_time?: string | null
}

type LogRow = {
  job_id: string | null
  worker_id: string | null
  started_at: string | null
  stopped_at: string | null
}

type LogItem = {
  worker_id: string
  started_at: string
  stopped_at: string
  minutes: number
}

type WorkerJobRow = {
  job: JobRow
  worker_id: string
  minutes: number
  logged: boolean
  logs: LogItem[]
}

async function fetchProfiles(sb: any, workerIds: string[]) {
  const ids = Array.from(new Set(workerIds.map((x) => String(x || '').trim()).filter(Boolean)))
  if (!ids.length) return { rows: [], avatarKey: null as AvatarKey }

  const tries: ReadonlyArray<{ sel: string; key: AvatarKey }> = [
    { sel: 'id, full_name, avatar_path', key: 'avatar_path' },
    { sel: 'id, full_name, avatar_url', key: 'avatar_url' },
    { sel: 'id, full_name, photo_path', key: 'photo_path' },
    { sel: 'id, full_name', key: null },
  ]

  for (const t of tries) {
    const res = await sb.from('profiles').select(t.sel).in('id', ids)
    if (!res.error) return { rows: res.data || [], avatarKey: t.key }
    const msg = String(res.error.message || '')
    const missingCol = msg.includes('column') && msg.includes('does not exist')
    if (!missingCol) return { rows: res.data || [], avatarKey: t.key }
  }

  return { rows: [], avatarKey: null as AvatarKey }
}

async function fetchJobWorkerLinks(sb: any, jobIds: string[]) {
  const linksByJob = new Map<string, Set<string>>()
  const ids = Array.from(new Set(jobIds.map((x) => String(x || '').trim()).filter(Boolean)))
  if (!ids.length) return linksByJob

  for (const part of chunk(ids, 150)) {
    const res = await sb.from('job_workers').select('job_id,worker_id').in('job_id', part)
    if (res.error) {
      const msg = String(res.error.message || '')
      if (/does not exist|relation|schema cache/i.test(msg)) return new Map<string, Set<string>>()
      throw new ApiError(500, res.error.message, AdminApiErrorCode.DB_ERROR)
    }

    for (const row of (res.data || []) as Array<{ job_id?: string | null; worker_id?: string | null }>) {
      const jid = String(row.job_id || '').trim()
      const wid = String(row.worker_id || '').trim()
      if (!jid || !wid) continue
      const set = linksByJob.get(jid) || new Set<string>()
      set.add(wid)
      linksByJob.set(jid, set)
    }
  }

  return linksByJob
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const k = String(key || '').trim()
  const v = String(value || '').trim()
  if (!k || !v) return
  const set = map.get(k) || new Set<string>()
  set.add(v)
  map.set(k, set)
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    const sb = admin.db

    const url = new URL(req.url)
    const from = (url.searchParams.get('from') || url.searchParams.get('date_from') || '').trim()
    const to = (url.searchParams.get('to') || url.searchParams.get('date_to') || '').trim()

    const workerIdFilter = (url.searchParams.get('worker_id') || url.searchParams.get('workerId') || '').trim()
    const siteIdFilter = (url.searchParams.get('site_id') || url.searchParams.get('siteId') || '').trim()
    const wantByDay = truthy(url.searchParams.get('by_day') || url.searchParams.get('byDay'))

    const fromD = parseDateISO(from)
    const toD = parseDateISO(to)
    if (!fromD || !toD) {
      throw new ApiError(400, 'Invalid period (expected YYYY-MM-DD)', AdminApiErrorCode.REPORT_PERIOD_INVALID)
    }
    if (toD.getTime() < fromD.getTime()) {
      throw new ApiError(400, 'Invalid period: to is before from', AdminApiErrorCode.REPORT_PERIOD_ORDER)
    }

    const fromISO = asDateISO(fromD)
    const toISO = asDateISO(toD)

    // Do not filter by jobs.worker_id here: coworkers live in job_workers.
    let jobsQ = sb
      .from('jobs')
      .select('id, worker_id, site_id, job_date, scheduled_time, scheduled_end_time')
      .gte('job_date', fromISO)
      .lte('job_date', toISO)

    if (siteIdFilter) jobsQ = jobsQ.eq('site_id', siteIdFilter)

    let jobsRes = await jobsQ

    if (jobsRes.error && String(jobsRes.error.message || '').toLowerCase().includes('scheduled_end_time')) {
      let fallbackQ = sb
        .from('jobs')
        .select('id, worker_id, site_id, job_date, scheduled_time')
        .gte('job_date', fromISO)
        .lte('job_date', toISO)
      if (siteIdFilter) fallbackQ = fallbackQ.eq('site_id', siteIdFilter)
      jobsRes = await fallbackQ
    }

    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })
    }

    const jobsAll: JobRow[] = ((jobsRes.data || []) as any[])
      .filter((j) => !!j?.id && !!j?.site_id)
      .map((j) => ({
        id: String(j.id),
        worker_id: j.worker_id ? String(j.worker_id) : null,
        site_id: j.site_id ? String(j.site_id) : null,
        job_date: j.job_date ? String(j.job_date) : null,
        scheduled_time: j.scheduled_time ? String(j.scheduled_time) : null,
        scheduled_end_time: (j as any).scheduled_end_time ? String((j as any).scheduled_end_time) : null,
      }))

    if (!jobsAll.length) {
      return NextResponse.json({
        from: fromISO,
        to: toISO,
        total_minutes: 0,
        by_worker: [],
        by_site: [],
        by_day: wantByDay ? [] : undefined,
        job_details: [],
        entries: [],
      })
    }

    const jobById = new Map<string, JobRow>()
    for (const j of jobsAll) jobById.set(String(j.id), j)
    const allJobIds = jobsAll.map((j) => String(j.id)).filter(Boolean)

    const linksByJob = await fetchJobWorkerLinks(sb, allJobIds)

    const allLogsRows: LogRow[] = []
    for (const part of chunk(allJobIds, 150)) {
      const logsRes = await sb.from('time_logs').select('job_id, worker_id, started_at, stopped_at').in('job_id', part)
      if (logsRes.error) {
        return NextResponse.json({ error: logsRes.error.message }, { status: 500 })
      }
      allLogsRows.push(...((logsRes.data || []) as LogRow[]))
    }

    const participantsByJob = new Map<string, Set<string>>()
    const logsByJob = new Map<string, LogItem[]>()
    const logsByJobWorker = new Map<string, LogItem[]>()

    for (const j of jobsAll) {
      if (j.worker_id) addToSetMap(participantsByJob, j.id, j.worker_id)
      for (const wid of linksByJob.get(j.id) || []) addToSetMap(participantsByJob, j.id, wid)
    }

    for (const l of allLogsRows) {
      const jobId = String(l.job_id || '').trim()
      const job = jobId ? jobById.get(jobId) : null
      if (!job) continue
      const started = l.started_at ? String(l.started_at) : ''
      const stopped = l.stopped_at ? String(l.stopped_at) : ''
      if (!started || !stopped) continue
      const minutes = minutesBetween(started, stopped)
      if (minutes <= 0) continue

      const workerId = String(l.worker_id || job.worker_id || '').trim()
      if (!workerId) continue

      const item: LogItem = { worker_id: workerId, started_at: started, stopped_at: stopped, minutes }
      logsByJob.set(jobId, [...(logsByJob.get(jobId) || []), item])
      const wk = `${jobId}|${workerId}`
      logsByJobWorker.set(wk, [...(logsByJobWorker.get(wk) || []), item])
      addToSetMap(participantsByJob, jobId, workerId)
    }

    const workerJobRows: WorkerJobRow[] = []
    for (const job of jobsAll) {
      const jobId = String(job.id)
      const participants = Array.from(participantsByJob.get(jobId) || new Set<string>())
      if (!participants.length) continue

      const allLogs = (logsByJob.get(jobId) || []).slice().sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
      const fallbackMinutes = spanMinutes(allLogs)

      for (const workerId of participants) {
        if (workerIdFilter && workerId !== workerIdFilter) continue
        const ownLogs = (logsByJobWorker.get(`${jobId}|${workerId}`) || []).slice().sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
        const hasOwnLogs = ownLogs.length > 0
        const logs = hasOwnLogs ? ownLogs : allLogs
        const minutes = hasOwnLogs ? ownLogs.reduce((sum, x) => sum + x.minutes, 0) : fallbackMinutes
        workerJobRows.push({ job, worker_id: workerId, minutes, logged: minutes > 0, logs })
      }
    }

    if (!workerJobRows.length) {
      return NextResponse.json({
        from: fromISO,
        to: toISO,
        total_minutes: 0,
        by_worker: [],
        by_site: [],
        by_day: wantByDay ? [] : undefined,
        job_details: [],
        entries: [],
      })
    }

    type WorkerAgg = { worker_id: string; minutes: number; job_ids: Set<string>; logged_job_ids: Set<string> }
    type SiteAgg = { site_id: string; minutes: number; job_ids: Set<string>; logged_job_ids: Set<string> }
    type DayAgg = { date: string; minutes: number; job_ids: Set<string>; logged_job_ids: Set<string> }

    const workerAgg = new Map<string, WorkerAgg>()
    const siteAgg = new Map<string, SiteAgg>()
    const dayAgg = new Map<string, DayAgg>()

    let totalMinutes = 0

    for (const row of workerJobRows) {
      const jobId = String(row.job.id)
      const workerId = String(row.worker_id)
      const siteId = String(row.job.site_id || '').trim()
      const day = String(row.job.job_date || '')
      const minutes = row.minutes

      totalMinutes += minutes

      const wa = workerAgg.get(workerId) || { worker_id: workerId, minutes: 0, job_ids: new Set<string>(), logged_job_ids: new Set<string>() }
      wa.minutes += minutes
      wa.job_ids.add(jobId)
      if (minutes > 0) wa.logged_job_ids.add(jobId)
      workerAgg.set(workerId, wa)

      if (siteId) {
        const sa = siteAgg.get(siteId) || { site_id: siteId, minutes: 0, job_ids: new Set<string>(), logged_job_ids: new Set<string>() }
        sa.minutes += minutes
        sa.job_ids.add(jobId)
        if (minutes > 0) sa.logged_job_ids.add(jobId)
        siteAgg.set(siteId, sa)
      }

      if (wantByDay && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        const da = dayAgg.get(day) || { date: day, minutes: 0, job_ids: new Set<string>(), logged_job_ids: new Set<string>() }
        da.minutes += minutes
        da.job_ids.add(jobId)
        if (minutes > 0) da.logged_job_ids.add(jobId)
        dayAgg.set(day, da)
      }
    }

    const workerIds = Array.from(workerAgg.keys())
    const siteIds = Array.from(siteAgg.keys())
    const allProfileIds = Array.from(new Set([...workerIds, ...Array.from(participantsByJob.values()).flatMap((s) => Array.from(s))]))

    const [profilesPack, sitesRes] = await Promise.all([
      fetchProfiles(sb, allProfileIds),
      siteIds.length ? sb.from('sites').select('id, name').in('id', siteIds) : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 500 })

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
      const { data: signed, error: signErr } = await localPhotoBucket(WORKER_BUCKET).createSignedUrls(uniqPaths, ttl)
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
          avatar_url,
          minutes: a.minutes,
          jobs_count: a.job_ids.size,
          logged_jobs: a.logged_job_ids.size,
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
          jobs_count: a.job_ids.size,
          logged_jobs: a.logged_job_ids.size,
        }
      })
      .sort((a, b) => b.minutes - a.minutes || String(a.site_name || '').localeCompare(String(b.site_name || '')))

    const by_day = wantByDay
      ? Array.from(dayAgg.values())
          .map((a) => ({ date: a.date, minutes: a.minutes, jobs_count: a.job_ids.size, logged_jobs: a.logged_job_ids.size }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      : undefined

    const job_details = workerJobRows
      .map((row) => {
        const job = row.job
        const jobId = String(job.id)
        const siteId = String(job.site_id || '')
        const workerId = String(row.worker_id)
        const site = siteById.get(siteId)
        const worker = profById.get(workerId)
        const coworkers = Array.from(participantsByJob.get(jobId) || new Set<string>())
          .filter((id) => id !== workerId)
          .map((id) => ({ worker_id: id, worker_name: profById.get(id)?.full_name ?? null }))

        return {
          job_id: `${jobId}:${workerId}`,
          source_job_id: jobId,
          job_date: String(job.job_date || ''),
          scheduled_time: String(job.scheduled_time || '') || null,
          scheduled_end_time: String(job.scheduled_end_time || '') || null,
          worker_id: workerId,
          worker_name: worker?.full_name ?? null,
          site_id: siteId,
          site_name: site?.name ?? null,
          minutes: row.minutes,
          logs: row.logs.map((x) => ({ worker_id: x.worker_id, started_at: x.started_at, stopped_at: x.stopped_at, minutes: x.minutes })),
          coworkers,
        }
      })
      .sort(
        (a, b) =>
          String(a.job_date).localeCompare(String(b.job_date)) ||
          String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')) ||
          String(a.worker_name || '').localeCompare(String(b.worker_name || '')),
      )

    const by_job = wantByDay
      ? job_details
          .map((j) => ({
            job_id: j.source_job_id,
            job_date: j.job_date,
            site_id: j.site_id,
            site_name: j.site_name,
            scheduled_time: j.scheduled_time,
            scheduled_end_time: j.scheduled_end_time,
            worker_id: j.worker_id,
            worker_name: j.worker_name,
            minutes: j.minutes,
          }))
          .sort((a, b) => String(a.job_date).localeCompare(String(b.job_date)) || b.minutes - a.minutes)
      : undefined

    const entries: any[] = []
    for (const row of workerJobRows) {
      const job = row.job
      const jobId = String(job.id)
      const workerId = String(row.worker_id)
      const siteId = String(job.site_id || '')
      const worker = profById.get(workerId)
      const site = siteById.get(siteId)

      for (const l of row.logs) {
        entries.push({
          job_id: jobId,
          job_date: String(job.job_date || ''),
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
      by_day,
      by_job,
      job_details,
      entries,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
