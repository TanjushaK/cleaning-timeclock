import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import {
  collectMultipartImages,
  createWorkerAdminMessageWithPhotos,
  getWorkerAdminUnreadCount,
  insertWorkerAdminMessage,
  listWorkerAdminMessages,
  parseOptionalWorkerAdminBodyField,
  parseWorkerAdminBody,
} from '@/lib/server/worker-admin-chat'
import { notifyWorkerAdminChatMessageSent } from '@/lib/server/push-notifications'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function assertTargetWorker(
  db: Parameters<typeof listWorkerAdminMessages>[0],
  workerId: string,
): Promise<void> {
  const { data, error } = await db.from('profiles').select('id,role,active').eq('id', workerId).maybeSingle()
  if (error) throw new ApiError(400, error.message, AdminApiErrorCode.DB_ERROR)
  if (!data) throw new ApiError(404, 'Worker not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
  const role = String((data as { role?: string | null }).role || '')
  if (role !== 'worker') throw new ApiError(400, 'Target must be a worker profile', AdminApiErrorCode.ACTIVATE_NOT_WORKER)
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ workerId: string }> }) {
  try {
    const { db, userId } = await requireAdmin(req)
    const { workerId: raw } = await ctx.params
    const workerId = String(raw || '').trim()
    if (!workerId) throw new ApiError(400, 'worker id required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    await assertTargetWorker(db, workerId)
    const messages = await listWorkerAdminMessages(db, workerId, { attachmentUrlMode: 'admin-proxy' })
    const unread_count = await getWorkerAdminUnreadCount(db, {
      workerId,
      userId,
      readerRole: 'admin',
    })
    return NextResponse.json({ messages, unread_count })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ workerId: string }> }) {
  try {
    const { db, userId } = await requireAdmin(req)
    const { workerId: raw } = await ctx.params
    const workerId = String(raw || '').trim()
    if (!workerId) throw new ApiError(400, 'worker id required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    await assertTargetWorker(db, workerId)
    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const bodyText = parseOptionalWorkerAdminBodyField(form.get('body'))
      const files = collectMultipartImages(form)
      const message = await createWorkerAdminMessageWithPhotos(db, {
        workerId,
        authorId: userId,
        authorRole: 'admin',
        body: bodyText,
        files,
        attachmentUrlMode: 'admin-proxy',
      })
      void notifyWorkerAdminChatMessageSent(db, workerId, message)
      return NextResponse.json({ message })
    }

    const rawBody = await req.json().catch(() => ({}))
    const bodyText = parseWorkerAdminBody(rawBody)

    const message = await insertWorkerAdminMessage(db, {
      workerId,
      authorId: userId,
      authorRole: 'admin',
      body: bodyText,
    })
    void notifyWorkerAdminChatMessageSent(db, workerId, message)
    return NextResponse.json({ message })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
