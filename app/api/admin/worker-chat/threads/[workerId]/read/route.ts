import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { markWorkerAdminMessagesRead } from '@/lib/server/worker-admin-chat'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function assertTargetWorker(
  db: Parameters<typeof markWorkerAdminMessagesRead>[0],
  workerId: string,
): Promise<void> {
  const { data, error } = await db.from('profiles').select('id,role').eq('id', workerId).maybeSingle()
  if (error) throw new ApiError(400, error.message, AdminApiErrorCode.DB_ERROR)
  if (!data) throw new ApiError(404, 'Worker not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
  const role = String((data as { role?: string | null }).role || '')
  if (role !== 'worker') throw new ApiError(400, 'Target must be a worker profile', AdminApiErrorCode.ACTIVATE_NOT_WORKER)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ workerId: string }> }) {
  try {
    const { db, userId } = await requireAdmin(req)
    const { workerId: raw } = await ctx.params
    const workerId = String(raw || '').trim()
    if (!workerId) throw new ApiError(400, 'worker id required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    await assertTargetWorker(db, workerId)
    await markWorkerAdminMessagesRead(db, { workerId, userId, readerRole: 'admin' })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
