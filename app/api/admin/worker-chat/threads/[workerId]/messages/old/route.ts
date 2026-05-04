import { NextRequest, NextResponse } from 'next/server'

import { adminChatPhotoBucket } from '@/lib/server/worker-admin-chat-media'
import { listWorkerAdminMessages } from '@/lib/server/worker-admin-chat'
import { dbQuery } from '@/lib/server/pool'
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

function clampDays(raw: string | null): number {
  const n = Number.parseInt(String(raw ?? '30'), 10)
  const base = Number.isFinite(n) ? n : 30
  return Math.min(365, Math.max(7, base))
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ workerId: string }> }) {
  try {
    const { db } = await requireAdmin(req)
    const { workerId: wRaw } = await ctx.params
    const workerId = String(wRaw || '').trim()
    if (!workerId) throw new ApiError(400, 'worker id required', AdminApiErrorCode.DB_ERROR)

    await assertTargetWorker(db, workerId)

    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get('days'))

    const sel = await dbQuery<{ id: string }>(
      `select id::text as id
         from worker_admin_messages
        where worker_id = $1::uuid
          and deleted_at is null
          and created_at < (now() - ($2::int * interval '1 day'))`,
      [workerId, days],
    )

    const messageIds = sel.rows.map((r) => r.id).filter(Boolean)
    if (messageIds.length === 0) {
      return NextResponse.json({ ok: true, deleted_messages: 0, deleted_attachments: 0 })
    }

    const pathsRes = await dbQuery<{ path: string | null }>(
      `select path
         from worker_admin_message_attachments
        where message_id = any($1::uuid[])
          and deleted_at is null`,
      [messageIds],
    )

    const paths = [...new Set(pathsRes.rows.map((r) => String(r.path || '').trim()).filter(Boolean))]
    if (paths.length > 0) {
      try {
        await adminChatPhotoBucket().remove(paths)
      } catch {
        // best-effort storage cleanup
      }
    }

    const attUp = await dbQuery(
      `update worker_admin_message_attachments
          set deleted_at = now()
        where message_id = any($1::uuid[])
          and deleted_at is null`,
      [messageIds],
    )

    const msgUp = await dbQuery(
      `update worker_admin_messages
          set deleted_at = now()
        where id = any($1::uuid[])
          and worker_id = $2::uuid
          and deleted_at is null`,
      [messageIds, workerId],
    )

    return NextResponse.json({
      ok: true,
      deleted_messages: msgUp.rowCount ?? 0,
      deleted_attachments: attUp.rowCount ?? 0,
    })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
