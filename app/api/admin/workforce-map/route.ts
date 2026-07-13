import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  status: string | null
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time?: string | null
  site_id: string | null
  worker_id: string | null
}

type SiteRow = {
  id: string
  name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  radius: number | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  active: boolean | null
}

type JobWorkerRow = {
  job_id: string | null
  worker_id: string | null
}

type TimeLogRow = {
  job_id: string | null
  worker_id: string | null
  started_at: string | null
  stopped_at: string | null
}

function isISODate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false

  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function displayName(profile: ProfileRow | undefined, workerId: string) {
  const value = String(profile?.full_name || '').trim()
  return value || workerId.slice(0, 8)
}

function scheduleDateTime(job: JobRow): Date | null {
  if (!job.job_date || !job.scheduled_time) return null
  const date = String(job.job_date).slice(0, 10)
  const time = String(job.scheduled_time).slice(0, 8)
  const parsed = new Date(`${date}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function deriveParticipantStatus(
  job: JobRow,
  log: TimeLogRow | undefined,
  now: Date,
): 'scheduled' | 'working' | 'completed' | 'late' | 'missing' {
  if (log?.started_at && !log.stopped_at) return 'working'
  if (log?.started_at && log.stopped_at) return 'completed'

  const scheduled = scheduleDateTime(job)
  if (!scheduled) return 'scheduled'

  const graceMs = 15 * 60 * 1000
  const diff = now.getTime() - scheduled.getTime()
  if (diff > 24 * 60 * 60 * 1000) return 'missing'
  if (diff > graceMs) return 'late'
  return 'scheduled'
}

export async function GET(req: NextRequest) {
  try {
    const { db: admin } = await requireAdmin(req)
    const sp = req.nextUrl.searchParams
    const dateFrom = (sp.get('date_from') || sp.get('from') || '').trim()
    const dateTo = (sp.get('date_to') || sp.get('to') || '').trim()

    if (!dateFrom || !dateTo) {
      throw new ApiError(400, 'from and to are required', AdminApiErrorCode.SCHEDULE_DATES_REQUIRED)
    }
    if (!isISODate(dateFrom) || !isISODate(dateTo)) {
      throw new ApiError(400, 'Invalid date range', AdminApiErrorCode.SCHEDULE_DATES_INVALID)
    }

    let jobsQuery = admin
      .from('jobs')
      .select('id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id')
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    const siteFilter = (sp.get('site_id') || '').trim()
    if (siteFilter) jobsQuery = jobsQuery.eq('site_id', siteFilter)

    let { data: jobsRaw, error: jobsError } = await jobsQuery
    if (jobsError && String(jobsError.message || '').toLowerCase().includes('scheduled_end_time')) {
      let fallback = admin
        .from('jobs')
        .select('id,status,job_date,scheduled_time,site_id,worker_id')
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)
        .order('job_date', { ascending: true })
        .order('scheduled_time', { ascending: true })
      if (siteFilter) fallback = fallback.eq('site_id', siteFilter)
      ;({ data: jobsRaw, error: jobsError } = await fallback)
    }
    if (jobsError) throw new ApiError(500, jobsError.message, AdminApiErrorCode.DB_ERROR)

    const jobs = (jobsRaw || []) as JobRow[]
    const jobIds = jobs.map((job) => job.id)
    const siteIds = Array.from(new Set(jobs.map((job) => job.site_id).filter(Boolean))) as string[]

    const [sitesResult, workersResult, logsResult] = await Promise.all([
      siteIds.length
        ? admin.from('sites').select('id,name,address,lat,lng,radius').in('id', siteIds)
        : Promise.resolve({ data: [], error: null } as const),
      jobIds.length
        ? admin.from('job_workers').select('job_id,worker_id').in('job_id', jobIds)
        : Promise.resolve({ data: [], error: null } as const),
      jobIds.length
        ? admin.from('time_logs').select('job_id,worker_id,started_at,stopped_at').in('job_id', jobIds)
        : Promise.resolve({ data: [], error: null } as const),
    ])

    if (sitesResult.error) throw new ApiError(500, sitesResult.error.message, AdminApiErrorCode.DB_ERROR)
    if (workersResult.error) throw new ApiError(500, workersResult.error.message, AdminApiErrorCode.DB_ERROR)
    if (logsResult.error) throw new ApiError(500, logsResult.error.message, AdminApiErrorCode.DB_ERROR)

    const links = (workersResult.data || []) as JobWorkerRow[]
    const logs = (logsResult.data || []) as TimeLogRow[]

    const participantIds = new Set<string>()
    for (const job of jobs) if (job.worker_id) participantIds.add(job.worker_id)
    for (const link of links) if (link.worker_id) participantIds.add(link.worker_id)

    const profilesResult = participantIds.size
      ? await admin.from('profiles').select('id,full_name,active').in('id', Array.from(participantIds))
      : { data: [], error: null }
    if (profilesResult.error) throw new ApiError(500, profilesResult.error.message, AdminApiErrorCode.DB_ERROR)

    const siteById = new Map<string, SiteRow>()
    for (const site of (sitesResult.data || []) as SiteRow[]) siteById.set(site.id, site)

    const profileById = new Map<string, ProfileRow>()
    for (const profile of (profilesResult.data || []) as ProfileRow[]) profileById.set(profile.id, profile)

    const linkedByJob = new Map<string, Set<string>>()
    for (const link of links) {
      if (!link.job_id || !link.worker_id) continue
      if (!linkedByJob.has(link.job_id)) linkedByJob.set(link.job_id, new Set())
      linkedByJob.get(link.job_id)!.add(link.worker_id)
    }

    const latestLogByParticipant = new Map<string, TimeLogRow>()
    for (const log of logs) {
      if (!log.job_id || !log.worker_id) continue
      const key = `${log.job_id}:${log.worker_id}`
      const current = latestLogByParticipant.get(key)
      if (!current || String(log.started_at || '') > String(current.started_at || '')) {
        latestLogByParticipant.set(key, log)
      }
    }

    const now = new Date()
    const items = jobs.map((job) => {
      const workerIds = new Set<string>()
      if (job.worker_id) workerIds.add(job.worker_id)
      for (const workerId of linkedByJob.get(job.id) || []) workerIds.add(workerId)

      const participants = Array.from(workerIds).map((workerId) => {
        const log = latestLogByParticipant.get(`${job.id}:${workerId}`)
        return {
          worker_id: workerId,
          worker_name: displayName(profileById.get(workerId), workerId),
          active: profileById.get(workerId)?.active ?? null,
          status: deriveParticipantStatus(job, log, now),
          started_at: log?.started_at ?? null,
          stopped_at: log?.stopped_at ?? null,
        }
      })

      const statuses = participants.map((participant) => participant.status)
      const summaryStatus = statuses.includes('working')
        ? 'working'
        : statuses.includes('late')
          ? 'late'
          : statuses.includes('missing')
            ? 'missing'
            : statuses.length > 0 && statuses.every((status) => status === 'completed')
              ? 'completed'
              : participants.length === 0
                ? 'unassigned'
                : 'scheduled'

      const site = job.site_id ? siteById.get(job.site_id) : undefined
      return {
        job_id: job.id,
        job_status: job.status,
        job_date: job.job_date,
        scheduled_time: job.scheduled_time,
        scheduled_end_time: job.scheduled_end_time ?? null,
        summary_status: summaryStatus,
        site: site
          ? {
              id: site.id,
              name: site.name,
              address: site.address,
              lat: site.lat,
              lng: site.lng,
              radius: site.radius,
            }
          : null,
        participants,
        participant_count: participants.length,
      }
    })

    return NextResponse.json({
      date_from: dateFrom,
      date_to: dateTo,
      generated_at: now.toISOString(),
      items,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
