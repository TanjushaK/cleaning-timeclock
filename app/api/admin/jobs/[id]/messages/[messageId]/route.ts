import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { deleteJobMessageAsAdmin } from '@/lib/server/job-shift-chat'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function assertJobExists(db: Parameters<typeof deleteJobMessageAsAdmin>[0], jobId: string) {
  const { data, error } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
  if (error) throw new ApiError(400, error.message, AdminApiErrorCode.DB_ERROR)
  if (!data) throw new ApiError(404, 'Job not found', AdminApiErrorCode.DB_ERROR)
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { db } = await requireAdmin(req)
    const jobId = await routeDynamicId(req, ctx, 'id')
    const messageId = await routeDynamicId(req, ctx, 'messageId')
    if (!jobId) throw new ApiError(400, 'job id required')
    if (!messageId) throw new ApiError(400, 'message id required')

    await assertJobExists(db, jobId)
    const out = await deleteJobMessageAsAdmin(db, { jobId, messageId })
    return NextResponse.json(out)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
