import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let ASSIGN_TABLE: string | null | undefined = undefined

async function resolveAssignmentsTable(db: any): Promise<string | null> {
  if (ASSIGN_TABLE !== undefined) return ASSIGN_TABLE
  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await db.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGN_TABLE = t
      return t
    }
    const msg = String(error?.message || '')
    const missing = msg.includes('Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    const low = msg.toLowerCase()
    const forbidden = low.includes('permission denied') || low.includes('row level security') || low.includes('rls')
    if (forbidden) {
      // Таблица существует, но в RLS-режиме недоступна — пробуем следующий кандидат.
      continue
    }
    if (!missing) {
      ASSIGN_TABLE = t
      return t
    }
  }
  ASSIGN_TABLE = null
  return null
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.jobId || body?.job_id || body?.id || '').trim()
    if (!jobId) throw new ApiError(400, 'job id required', AppApiErrorCodes.JOB_ID_REQUIRED)

    const { data: job, error: jErr } = await db
      .from('jobs')
      .select('id,status,worker_id,site_id')
      .eq('id', jobId)
      .maybeSingle()

    if (jErr) throw new ApiError(400, jErr.message, AppApiErrorCodes.JOB_ACCEPT_QUERY_FAILED)
    if (!job) throw new ApiError(404, 'Job not found', AppApiErrorCodes.JOB_NOT_FOUND)

    if (job.status !== 'planned') throw new ApiError(400, 'Invalid job status', AppApiErrorCodes.JOB_START_STATUS_INVALID)

    if (job.worker_id && String(job.worker_id) === String(userId)) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (job.worker_id) throw new ApiError(409, 'Job taken', AppApiErrorCodes.JOB_TAKEN_BY_OTHER)

    const siteId = String(job.site_id || '').trim()
    if (!siteId) throw new ApiError(400, 'site_id missing', AppApiErrorCodes.JOB_SITE_ID_MISSING)

    // Accept eligibility must match listing semantics:
    // either explicit job link in `job_workers` OR site-level assignment.
    const [{ data: jw, error: jwErr }, t] = await Promise.all([
      db
        .from('job_workers')
        .select('job_id')
        .eq('job_id', jobId)
        .eq('worker_id', userId)
        .limit(1),
      resolveAssignmentsTable(db),
    ])
    if (jwErr) throw new ApiError(400, jwErr.message, AppApiErrorCodes.JOB_ACCEPT_QUERY_FAILED)
    const viaJobWorkers = Array.isArray(jw) && jw.length > 0

    let viaAssignments = false
    if (t) {
      const { data: a, error: aErr } = await db
        .from(t)
        .select('site_id,worker_id')
        .eq('site_id', siteId)
        .eq('worker_id', userId)
        .limit(1)
      if (aErr) throw new ApiError(400, aErr.message, AppApiErrorCodes.JOB_ACCEPT_QUERY_FAILED)
      viaAssignments = Array.isArray(a) && a.length > 0
    }

    if (!viaJobWorkers && !viaAssignments) {
      throw new ApiError(403, 'Site not assigned', AppApiErrorCodes.SITE_NOT_IN_ASSIGNMENTS)
    }

    const { error: updErr } = await db
      .from('jobs')
      .update({ worker_id: userId })
      .eq('id', jobId)
      .is('worker_id', null)

    if (updErr) throw new ApiError(400, updErr.message, AppApiErrorCodes.JOB_ACCEPT_UPDATE_FAILED)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}


