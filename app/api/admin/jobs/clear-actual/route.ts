import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)
    const sb = guard.db

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id || body?.jobId || '').trim()
    if (!jobId) throw new ApiError(400, 'job_id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const { data: rows, error: selErr } = await sb.from('time_logs').select('id').eq('job_id', jobId)
    if (selErr) throw new ApiError(400, selErr.message, AdminApiErrorCode.DB_ERROR)

    const removed = Array.isArray(rows) ? rows.length : 0
    if (removed > 0) {
      const { error: delErr } = await sb.from('time_logs').delete().eq('job_id', jobId)
      if (delErr) throw new ApiError(400, delErr.message, AdminApiErrorCode.DB_ERROR)
    }

    return NextResponse.json({ ok: true, removed })
  } catch (e) {
    return toErrorResponse(e)
  }
}
