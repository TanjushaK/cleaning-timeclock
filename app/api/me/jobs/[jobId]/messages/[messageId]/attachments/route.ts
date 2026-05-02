import { NextRequest, NextResponse } from 'next/server'

import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { asIncomingFile, insertChatAttachment } from '@/lib/server/job-shift-chat'
import { workerCanAccessJob } from '@/lib/server/worker-job-access'
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { workerApiErrorResponse } from '@/lib/worker-api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ jobId: string; messageId: string }> }) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const jobId = await routeDynamicId(req, ctx, 'jobId')
    const messageId = await routeDynamicId(req, ctx, 'messageId')
    if (!jobId || !messageId) throw new ApiError(400, 'ids required', AppApiErrorCodes.JOB_ID_REQUIRED)

    const ok = await workerCanAccessJob(db, userId, jobId)
    if (!ok) return workerApiErrorResponse(403, AppApiErrorCodes.JOB_NOT_FOUND, 'Forbidden')

    const form = await req.formData()
    const file = asIncomingFile(form.get('file'))
    if (!file) throw new ApiError(400, 'No file', AppApiErrorCodes.PHOTOS_FILE_REQUIRED)

    const out = await insertChatAttachment({ db, jobId, messageId, file })
    return NextResponse.json(out)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
