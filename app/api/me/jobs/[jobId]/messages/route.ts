import { NextRequest, NextResponse } from 'next/server'

import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { insertJobMessage, listMessagesPayload } from '@/lib/server/job-shift-chat'
import { workerCanAccessJob } from '@/lib/server/worker-job-access'
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { workerApiErrorResponse } from '@/lib/worker-api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const jobId = await routeDynamicId(req, ctx, 'jobId')
    if (!jobId) throw new ApiError(400, 'job id required', AppApiErrorCodes.JOB_ID_REQUIRED)

    const ok = await workerCanAccessJob(db, userId, jobId)
    if (!ok) return workerApiErrorResponse(403, AppApiErrorCodes.JOB_NOT_FOUND, 'Forbidden')

    const payload = await listMessagesPayload(db, jobId)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const jobId = await routeDynamicId(req, ctx, 'jobId')
    if (!jobId) throw new ApiError(400, 'job id required', AppApiErrorCodes.JOB_ID_REQUIRED)

    const ok = await workerCanAccessJob(db, userId, jobId)
    if (!ok) return workerApiErrorResponse(403, AppApiErrorCodes.JOB_NOT_FOUND, 'Forbidden')

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const rawBody = body?.body
    const bodyPayload =
      typeof rawBody === 'string'
        ? rawBody.trim() || null
        : rawBody != null
          ? String(rawBody).trim() || null
          : null

    const out = await insertJobMessage(db, {
      jobId,
      authorId: userId,
      authorRole: 'worker',
      body: bodyPayload,
    })

    return NextResponse.json(out)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
