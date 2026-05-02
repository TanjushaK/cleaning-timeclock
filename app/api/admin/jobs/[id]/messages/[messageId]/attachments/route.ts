import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { asIncomingFile, insertChatAttachment } from '@/lib/server/job-shift-chat'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function assertJobExists(db: import('@/lib/server/compat/client').CompatClient, jobId: string) {
  const { data, error } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
  if (error) throw new ApiError(400, error.message, AdminApiErrorCode.DB_ERROR)
  if (!data) throw new ApiError(404, 'Job not found', AdminApiErrorCode.DB_ERROR)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const { db } = await requireAdmin(req)
    const jobId = await routeDynamicId(req, ctx, 'id')
    const messageId = await routeDynamicId(req, ctx, 'messageId')
    if (!jobId || !messageId) throw new ApiError(400, 'ids required')

    await assertJobExists(db, jobId)

    const form = await req.formData()
    const file = asIncomingFile(form.get('file'))
    if (!file) throw new ApiError(400, 'No file')

    const out = await insertChatAttachment({ db, jobId, messageId, file })
    return NextResponse.json(out)
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
