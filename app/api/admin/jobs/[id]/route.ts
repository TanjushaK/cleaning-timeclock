import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'job id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const { db } = await requireAdmin(req.headers)

    const { data: job, error: jobErr } = await db
      .from('jobs')
      .select('id,status')
      .eq('id', id)
      .maybeSingle()

    if (jobErr) throw new ApiError(400, jobErr.message, AdminApiErrorCode.DB_ERROR)
    if (!job) throw new ApiError(404, 'Shift not found', AdminApiErrorCode.JOB_NOT_FOUND)
    if (String((job as any).status || '') !== 'done') {
      throw new ApiError(400, 'Only completed shifts (status=done) can be deleted', AdminApiErrorCode.JOB_DELETE_DONE_ONLY)
    }

    const bestEffortDelete = async (table: string) => {
      try {
        const { error } = await db.from(table).delete().eq('job_id', id)
        if (error) {
          const msg = String(error.message || '')
          if (/does not exist/i.test(msg) || /not found/i.test(msg) || /schema cache/i.test(msg)) return
          throw error
        }
      } catch (e: any) {
        const msg = String(e?.message || '')
        if (/does not exist/i.test(msg) || /not found/i.test(msg) || /schema cache/i.test(msg)) return
        throw e
      }
    }

    await bestEffortDelete('job_workers')
    await bestEffortDelete('job_events')
    await bestEffortDelete('client_events')

    const { error: tlErr } = await db.from('time_logs').delete().eq('job_id', id)
    if (tlErr) throw new ApiError(400, tlErr.message, AdminApiErrorCode.DB_ERROR)

    const { error: jErr } = await db.from('jobs').delete().eq('id', id)
    if (jErr) throw new ApiError(400, jErr.message, AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
