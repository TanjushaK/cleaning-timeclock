import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { insertJobMessage, listMessagesPayload } from '@/lib/server/job-shift-chat'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function assertJobExists(db: Parameters<typeof listMessagesPayload>[0], jobId: string) {
  const { data, error } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
  if (error) throw new ApiError(400, error.message, AdminApiErrorCode.DB_ERROR)
  if (!data) throw new ApiError(404, 'Job not found', AdminApiErrorCode.DB_ERROR)
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req)
    const jobId = await routeDynamicId(req, ctx, 'id')
    if (!jobId) throw new ApiError(400, 'job id required')

    await assertJobExists(db, jobId)
    const payload = await listMessagesPayload(db, jobId)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db, userId } = await requireAdmin(req)
    const jobId = await routeDynamicId(req, ctx, 'id')
    if (!jobId) throw new ApiError(400, 'job id required')

    await assertJobExists(db, jobId)

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
      authorRole: 'admin',
      body: bodyPayload,
    })

    return NextResponse.json(out)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
