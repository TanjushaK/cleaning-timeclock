import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

let ASSIGNMENTS_TABLE: string | null = null

async function resolveAssignmentsTable(admin: SupabaseClient): Promise<string> {
  if (ASSIGNMENTS_TABLE) return ASSIGNMENTS_TABLE

  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await admin.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGNMENTS_TABLE = t
      return t
    }
    const msg = String(error?.message || '')
    const missing = msg.includes('Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    if (!missing) {
      ASSIGNMENTS_TABLE = t
      return t
    }
  }

  throw new ApiError(500, 'Assignments table not found', AdminApiErrorCode.ASSIGNMENTS_TABLE_MISSING)
}

let JOBS_END_TIME_COL: string | null | undefined = undefined

async function resolveJobsEndTimeColumn(admin: SupabaseClient) {
  if (JOBS_END_TIME_COL !== undefined) return JOBS_END_TIME_COL

  const candidates = ['scheduled_time_to', 'scheduled_end_time', 'scheduled_time_end', 'end_time', 'time_to', 'scheduled_to']
  for (const c of candidates) {
    const { error } = await admin.from('jobs').select(c).limit(1)
    if (!error) {
      JOBS_END_TIME_COL = c
      return c
    }

    const msg = String(error?.message || '')
    const missing = msg.includes('does not exist') || msg.includes('Could not find') || msg.includes('column') || msg.includes('unknown')
    if (!missing) {
      JOBS_END_TIME_COL = c
      return c
    }
  }

  JOBS_END_TIME_COL = null
  return null
}

function normalizeHHMM(v: string) {
  const t = String(v || '').trim()
  if (!t) return null
  return t.length === 5 ? `${t}:00` : t
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req)
    const admin = guard.supabase

    const body = await req.json().catch(() => ({} as any))

    const siteId = String(body?.site_id || '').trim()
    const jobDate = String(body?.job_date || '').trim()
    const scheduledTime = String(body?.scheduled_time || '').trim()

    const scheduledTimeToRaw =
      body?.scheduled_time_to ?? body?.scheduled_end_time ?? body?.scheduled_time_end ?? body?.end_time ?? body?.time_to ?? null

    const workerIdsRaw = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    const workerIds = workerIdsRaw.map((x: any) => String(x).trim()).filter(Boolean)

    if (!siteId) throw new ApiError(400, 'site_id is required', AdminApiErrorCode.SITE_ID_REQUIRED)
    if (!jobDate) throw new ApiError(400, 'job_date is required', AdminApiErrorCode.JOB_DATE_REQUIRED)
    if (!scheduledTime) throw new ApiError(400, 'scheduled_time is required', AdminApiErrorCode.JOB_SCHEDULE_TIME_REQUIRED)
    if (workerIds.length === 0) throw new ApiError(400, 'Select at least one worker', AdminApiErrorCode.WORKER_IDS_REQUIRED)

    const assignTable = await resolveAssignmentsTable(admin)
    for (const wid of workerIds) {
      const { data: ex, error: exErr } = await admin.from(assignTable).select('site_id,worker_id').eq('site_id', siteId).eq('worker_id', wid).limit(1)
      if (exErr) throw new ApiError(500, exErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)
      if (!Array.isArray(ex) || ex.length === 0) {
        const { error: insAErr } = await admin.from(assignTable).insert([{ site_id: siteId, worker_id: wid }])
        if (insAErr) throw new ApiError(500, insAErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)
      }
    }

    const timeFrom = normalizeHHMM(scheduledTime)
    if (!timeFrom) throw new ApiError(400, 'scheduled_time is required', AdminApiErrorCode.JOB_SCHEDULE_TIME_REQUIRED)

    const timeTo = scheduledTimeToRaw == null ? null : normalizeHHMM(String(scheduledTimeToRaw))
    const endCol = timeTo ? await resolveJobsEndTimeColumn(admin) : null

    const rows = workerIds.map((worker_id: string) => {
      const row: Record<string, any> = {
        site_id: siteId,
        worker_id,
        job_date: jobDate,
        scheduled_time: timeFrom,
        status: 'planned',
      }
      if (endCol && timeTo) row[endCol] = timeTo
      return row
    })

    const { data, error } = await admin.from('jobs').insert(rows).select('id')
    if (error) throw new ApiError(500, error.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
