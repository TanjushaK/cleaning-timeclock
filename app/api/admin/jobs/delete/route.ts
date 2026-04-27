import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isIgnorableMissingTableMsg(msg: string) {
  return (
    /does not exist/i.test(msg) ||
    /not found/i.test(msg) ||
    /schema cache/i.test(msg)
  )
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)
    const sb = guard.db

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id || body?.jobId || '').trim()
    if (!jobId) throw new ApiError(400, 'job_id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const { data: job, error: jobErr } = await sb.from('jobs').select('id, status').eq('id', jobId).maybeSingle()
    if (jobErr) throw new ApiError(400, jobErr.message, AdminApiErrorCode.DB_ERROR)
    if (!job) throw new ApiError(404, 'Shift not found', AdminApiErrorCode.JOB_NOT_FOUND)

    const bestEffortDelete = async (table: string) => {
      try {
        const { error } = await sb.from(table).delete().eq('job_id', jobId)
        if (error) {
          const msg = String(error.message || '')
          if (isIgnorableMissingTableMsg(msg)) return
          throw new ApiError(400, `${table}: ${error.message}`, AdminApiErrorCode.DB_ERROR)
        }
      } catch (e: unknown) {
        if (e instanceof ApiError) throw e
        const msg = String((e as { message?: string })?.message || '')
        if (isIgnorableMissingTableMsg(msg)) return
        throw new ApiError(400, msg || `${table}: delete failed`, AdminApiErrorCode.DB_ERROR)
      }
    }

    await bestEffortDelete('job_workers')
    await bestEffortDelete('job_events')
    await bestEffortDelete('client_events')

    const { error: tlErr } = await sb.from('time_logs').delete().eq('job_id', jobId)
    if (tlErr) throw new ApiError(400, `time_logs: ${tlErr.message}`, AdminApiErrorCode.DB_ERROR)

    const { error: jobDelErr } = await sb.from('jobs').delete().eq('id', jobId)
    if (jobDelErr) throw new ApiError(400, jobDelErr.message, AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
