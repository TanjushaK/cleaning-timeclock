import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  status: string | null
  worker_id: string | null
}

type ParticipantRow = { worker_id: string | null }
type TimeLogRow = { id: string; worker_id: string | null; started_at: string | null; stopped_at: string | null }

function validStoppedAt(raw: unknown) {
  const value = String(raw || '').trim()
  const parsed = new Date(value)
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'Valid stopped_at is required', AdminApiErrorCode.JOB_TIME_INVALID)
  }
  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new ApiError(400, 'stopped_at cannot be in the future', AdminApiErrorCode.JOB_TIME_INVALID)
  }
  return parsed.toISOString()
}

async function recomputeJobStatus(db: any, job: JobRow) {
  const normalized = String(job.status || '').toLowerCase()
  if (normalized === 'cancelled' || normalized === 'canceled') return

  const participants = new Set<string>()
  if (job.worker_id) participants.add(job.worker_id)

  const { data: linked, error: linkedError } = await db
    .from('job_workers')
    .select('worker_id')
    .eq('job_id', job.id)

  if (!linkedError) {
    for (const row of (linked || []) as ParticipantRow[]) {
      if (row.worker_id) participants.add(String(row.worker_id))
    }
  }

  const { data: logs, error: logsError } = await db
    .from('time_logs')
    .select('worker_id,started_at,stopped_at')
    .eq('job_id', job.id)

  if (logsError) throw new ApiError(400, logsError.message, AdminApiErrorCode.DB_ERROR)

  let hasOpen = false
  let hasStarted = false
  const completed = new Set<string>()

  for (const row of (logs || []) as TimeLogRow[]) {
    const workerId = row.worker_id ? String(row.worker_id) : ''
    if (!workerId || !row.started_at) continue
    hasStarted = true
    if (!row.stopped_at) hasOpen = true
    else completed.add(workerId)
  }

  const allCompleted = participants.size > 0 && Array.from(participants).every((workerId) => completed.has(workerId))
  const nextStatus = hasOpen ? 'in_progress' : allCompleted ? 'done' : hasStarted ? 'in_progress' : 'planned'

  const { error: updateError } = await db.from('jobs').update({ status: nextStatus }).eq('id', job.id)
  if (updateError) throw new ApiError(400, updateError.message, AdminApiErrorCode.DB_ERROR)
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const jobId = String(body?.job_id || '').trim()
    const workerId = String(body?.worker_id || '').trim()
    const stoppedAt = validStoppedAt(body?.stopped_at)

    if (!jobId) throw new ApiError(400, 'job_id is required', AdminApiErrorCode.JOB_ID_REQUIRED)
    if (!workerId) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const { data: job, error: jobError } = await db
      .from('jobs')
      .select('id,status,worker_id')
      .eq('id', jobId)
      .maybeSingle()

    if (jobError) throw new ApiError(400, jobError.message, AdminApiErrorCode.DB_ERROR)
    if (!job) throw new ApiError(404, 'Job not found', AdminApiErrorCode.JOB_NOT_FOUND)

    const { data: openLogs, error: openError } = await db
      .from('time_logs')
      .select('id,worker_id,started_at,stopped_at')
      .eq('job_id', jobId)
      .eq('worker_id', workerId)
      .is('stopped_at', null)
      .order('started_at', { ascending: true })

    if (openError) throw new ApiError(400, openError.message, AdminApiErrorCode.DB_ERROR)
    if (!openLogs?.length) {
      return NextResponse.json({ ok: true, already_stopped: true, closed_logs: 0 })
    }

    for (const row of openLogs as TimeLogRow[]) {
      if (row.started_at && new Date(row.started_at).getTime() > new Date(stoppedAt).getTime()) {
        throw new ApiError(400, 'stopped_at is before started_at', AdminApiErrorCode.JOB_TIME_INVALID)
      }
    }

    const ids = (openLogs as TimeLogRow[]).map((row) => row.id)
    const { error: updateError } = await db.from('time_logs').update({ stopped_at: stoppedAt }).in('id', ids)
    if (updateError) throw new ApiError(400, updateError.message, AdminApiErrorCode.DB_ERROR)

    await recomputeJobStatus(db, job as JobRow)

    return NextResponse.json({ ok: true, stopped_at: stoppedAt, closed_logs: ids.length })
  } catch (error) {
    return toErrorResponse(error)
  }
}
