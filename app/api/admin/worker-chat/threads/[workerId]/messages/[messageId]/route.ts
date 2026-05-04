import { NextRequest, NextResponse } from 'next/server'

import { adminChatPhotoBucket } from '@/lib/server/worker-admin-chat-media'
import { listWorkerAdminMessages } from '@/lib/server/worker-admin-chat'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function assertTargetWorker(
  db: Parameters<typeof listWorkerAdminMessages>[0],
  workerId: string,
): Promise<void> {
  const { data, error } = await db.from('profiles').select('id,role,active').eq('id', workerId).maybeSingle()
  if (error) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)
  if (!data) throw new ApiError(404, 'Worker not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
  const role = String((data as { role?: string | null }).role || '')
  if (role !== 'worker') throw new ApiError(400, 'Target must be a worker profile', AdminApiErrorCode.ACTIVATE_NOT_WORKER)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ workerId: string; messageId: string }> }) {
  try {
    const { db } = await requireAdmin(_req)
    const { workerId: wRaw, messageId: mRaw } = await ctx.params
    const workerId = String(wRaw || '').trim()
    const messageId = String(mRaw || '').trim()
    if (!workerId || !messageId) throw new ApiError(400, 'ids required', AdminApiErrorCode.DB_ERROR)

    await assertTargetWorker(db, workerId)

    const { data: msg, error: msgErr } = await db
      .from('worker_admin_messages')
      .select('id')
      .eq('id', messageId)
      .eq('worker_id', workerId)
      .is('deleted_at', null)
      .maybeSingle()

    if (msgErr) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)
    if (!msg) throw new ApiError(404, 'Message not found', AdminApiErrorCode.DB_ERROR)

    const { data: atts, error: attErr } = await db
      .from('worker_admin_message_attachments')
      .select('path')
      .eq('message_id', messageId)
      .is('deleted_at', null)

    if (attErr) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)

    const attRows = (atts ?? []) as Array<{ path?: string | null }>
    const paths = [
      ...new Set(attRows.map((r) => String(r.path || '').trim()).filter((p) => p.length > 0)),
    ]
    if (paths.length > 0) {
      try {
        const bucketClient = adminChatPhotoBucket()
        await bucketClient.remove(paths)
      } catch {
        // best-effort storage cleanup
      }
    }

    const now = new Date().toISOString()

    const { error: upAtt } = await db
      .from('worker_admin_message_attachments')
      .update({ deleted_at: now })
      .eq('message_id', messageId)
      .is('deleted_at', null)

    if (upAtt) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)

    const { error: upMsg } = await db
      .from('worker_admin_messages')
      .update({ deleted_at: now })
      .eq('id', messageId)
      .eq('worker_id', workerId)
      .is('deleted_at', null)

    if (upMsg) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
