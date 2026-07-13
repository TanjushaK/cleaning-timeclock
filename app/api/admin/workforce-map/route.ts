import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import {
  aggregateParticipantLogs,
  amsterdamScheduleDateTime,
  deriveParticipantStatus,
  deriveSummaryStatus,
} from '@/lib/workforce-map-status.mjs'

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

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function isMissingJobWorkersSchema(message: string) {
  return /does not exist|relation|schema cache/i.test(message)
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
    if (!isISODate(dateFrom) || !isISODate(dateTo) || dateFrom > dateTo) {
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

    const allJobs = (jobsRaw || []) as JobRow[]
    const allJobIds = allJobs.map((job) => job.id)

    const links: JobWorkerRow[] = []
    let jobWorkersAvailable = true
    for (const jobIdChunk of chunk(allJobIds, 200)) {
      const result = await admin.from('job_workers').select('job_id,worker_id').in('job_id', jobIdChunk)
      if (result.error) {
        const message = String(result.error.message || '')
        if (isMissingJobWorkersSchema(message)) {
          jobWorkersAvailable = false
          links.length = 0
          console.warn('[workforce-map] job_workers unavailable; using jobs.worker_id only:', message)
          break
        }
        throw new ApiError(500, result.error.message, AdminApiErrorCode.DB_ERROR)
      }
      links.push(...((result.data || []) as JobWorkerRow[]))
    }

    const linkedByJob = new Map<string, Set<string>>()
    for (const link of links) {
      if (!link.job_id || !link.worker_id) continue
      if (!linkedByJob.has(link.job_id)) linkedByJob.set(link.job_id, new Set())
      linkedByJob.get(link.job_id)!.add(link.worker_id)
    }

    const workerFilter = (sp.get('worker_id') || '').trim()
    const jobs = workerFilter
      ? allJobs.filter(
          (job) => job.worker_id === workerFilter || linkedByJob.get(job.id)?.has(workerFilter),
        )
      : allJobs

    const jobIds = jobs.map((job) => job.id)
    const siteIds = Array.from(new Set(jobs.map((job) => job.site_id).filter(Boolean))) as string[]

    const [sitesResult, logsResult] = await Promise.all([
      siteIds.length
        ? admin.from('sites').select('id,name,address,lat,lng,radius').in('id', siteIds)
        : Promise.resolve({ data: [], error: null } as const),
      jobIds.length
        ? admin.from('time_logs').select('job_id,worker_id,started_at,stopped_at').in('job_id', jobIds)
        : Promise.resolve({ data: [], error: null } as const),
    ])

    if (sitesResult.error) throw new ApiError(500, sitesResult.error.message, AdminApiErrorCode.DB_ERROR)
    if (logsResult.error) throw new ApiError(500, logsResult.error.message, AdminApiErrorCode.DB_ERROR)

    const logs = (logsResult.data || []) as TimeLogRow[]

    const participantIds = new Set<string>()
    for (const job of jobs) if (job.worker_id) participantIds.add(job.worker_id)
    for (const job of jobs) {
      for (const workerId of linkedByJob.get(job.id) || []) participantIds.add(workerId)
    }

    const profilesResult = participantIds.size
      ? await admin.from('profiles').select('id,full_name,active').in('id', Array.from(participantIds))
      : { data: [], error: null }
    if (profilesResult.error) throw new ApiError(500, profilesResult.error.message, AdminApiErrorCode.DB_ERROR)

    const siteById = new Map<string, SiteRow>()
    for (const site of (sitesResult.data || []) as SiteRow[]) siteById.set(site.id, site)

    const profileById = new Map<string, ProfileRow>()
    for (const profile of (profilesResult.data || []) as ProfileRow[]) profileById.set(profile.id, profile)

    const logsByParticipant = new Map<string, TimeLogRow[]>()
    for (const log of logs) {
      if (!log.job_id || !log.worker_id) continue
      const key = `${log.job_id}:${log.worker_id}`
      if (!logsByParticipant.has(key)) logsByParticipant.set(key, [])
      logsByParticipant.get(key)!.push(log)
    }

    const now = new Date()
    const items = jobs.map((job) => {
      const workerIds = new Set<string>()
      if (job.worker_id) workerIds.add(job.worker_id)
      for (const workerId of linkedByJob.get(job.id) || []) workerIds.add(workerId)

      const scheduledAt = amsterdamScheduleDateTime(job.job_date, job.scheduled_time)
      const participants = Array.from(workerIds).map((workerId) => {
        const log = aggregateParticipantLogs(logsByParticipant.get(`${job.id}:${workerId}`) || [])
        return {
          worker_id: workerId,
          worker_name: displayName(profileById.get(workerId), workerId),
          active: profileById.get(workerId)?.active ?? null,
          status: deriveParticipantStatus({
            jobStatus: job.status,
            scheduledAt,
            log,
            now,
          }),
          started_at: log.started_at,
          stopped_at: log.stopped_at,
        }
      })

      const summaryStatus = deriveSummaryStatus(
        job.status,
        participants.map((participant) => participant.status),
      )

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
      job_workers_available: jobWorkersAvailable,
      items,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
