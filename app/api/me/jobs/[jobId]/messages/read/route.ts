import { NextRequest, NextResponse } from 'next/server'

import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { markJobMessagesRead } from '@/lib/server/job-shift-chat'
import { workerCanAccessJob } from '@/lib/server/worker-job-access'
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { workerApiErrorResponse } from '@/lib/worker-api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const jobId = await routeDynamicId(req, ctx, 'jobId')
    if (!jobId) throw new ApiError(400, 'job id required', AppApiErrorCodes.JOB_ID_REQUIRED)

    const ok = await workerCanAccessJob(db, userId, jobId)
    if (!ok) return workerApiErrorResponse(403, AppApiErrorCodes.JOB_NOT_FOUND, 'Forbidden')

    await markJobMessagesRead(db, { jobId, userId, readerRole: 'worker' })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
