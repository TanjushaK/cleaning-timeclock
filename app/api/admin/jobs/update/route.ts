import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req)
    const admin = guard.supabase

    const body = await req.json().catch(() => ({} as any))

    const jobId = String(body?.job_id || '').trim()
    if (!jobId) throw new ApiError(400, 'job_id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const patch: Record<string, any> = {}

    if (body?.site_id != null) patch.site_id = String(body.site_id).trim() || null
    if (body?.worker_id != null) patch.worker_id = String(body.worker_id).trim() || null
    if (body?.job_date != null) patch.job_date = String(body.job_date).trim() || null
    if (body?.scheduled_time != null) {
      const t = String(body.scheduled_time).trim()
      patch.scheduled_time = t ? (t.length === 5 ? `${t}:00` : t) : null
    }
    if (body?.status != null) patch.status = String(body.status).trim() || null

    if (Object.keys(patch).length === 0)
      throw new ApiError(400, 'Nothing to update', AdminApiErrorCode.NOTHING_TO_UPDATE)

    const { data: logs, error: logsErr } = await admin.from('time_logs').select('id').eq('job_id', jobId).limit(1)
    if (logsErr) throw new ApiError(500, logsErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    const hasLogs = Array.isArray(logs) && logs.length > 0

    if (hasLogs) {
      if (patch.worker_id != null && patch.worker_id !== undefined) {
        throw new ApiError(400, 'Cannot change worker: time entries exist for this shift', AdminApiErrorCode.JOB_UPDATE_LOCKED)
      }
      if (patch.site_id != null && patch.site_id !== undefined) {
        throw new ApiError(400, 'Cannot change site: time entries exist for this shift', AdminApiErrorCode.JOB_UPDATE_LOCKED)
      }
      if (patch.job_date != null && patch.job_date !== undefined) {
        throw new ApiError(400, 'Cannot change date: time entries exist for this shift', AdminApiErrorCode.JOB_UPDATE_LOCKED)
      }
      if (patch.scheduled_time != null && patch.scheduled_time !== undefined) {
        throw new ApiError(400, 'Cannot change time: time entries exist for this shift', AdminApiErrorCode.JOB_UPDATE_LOCKED)
      }
    }

    const { error } = await admin.from('jobs').update(patch).eq('id', jobId)
    if (error) throw new ApiError(500, error.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
