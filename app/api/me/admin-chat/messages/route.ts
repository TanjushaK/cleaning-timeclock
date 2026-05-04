import { NextRequest, NextResponse } from 'next/server'

import {
  collectMultipartImages,
  createWorkerAdminMessageWithPhotos,
  getWorkerAdminUnreadCount,
  insertWorkerAdminMessage,
  listWorkerAdminMessages,
  parseOptionalWorkerAdminBodyField,
  parseWorkerAdminBody,
} from '@/lib/server/worker-admin-chat'
import { requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const workerId = userId
    const messages = await listWorkerAdminMessages(db, workerId)
    const unread_count = await getWorkerAdminUnreadCount(db, {
      workerId,
      userId,
      readerRole: 'worker',
    })
    return NextResponse.json({ messages, unread_count })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  const contentTypeLower = (req.headers.get('content-type') || '').toLowerCase()
  try {
    const { db, userId } = await requireActiveWorker(req)
    const workerId = userId

    if (contentTypeLower.includes('multipart/form-data')) {
      const form = await req.formData()
      const bodyText = parseOptionalWorkerAdminBodyField(form.get('body'))
      const files = collectMultipartImages(form)
      const message = await createWorkerAdminMessageWithPhotos(db, {
        workerId,
        authorId: userId,
        authorRole: 'worker',
        body: bodyText,
        files,
      })
      return NextResponse.json({ message })
    }

    const raw = await req.json().catch(() => ({}))
    const bodyText = parseWorkerAdminBody(raw)

    const message = await insertWorkerAdminMessage(db, {
      workerId,
      authorId: userId,
      authorRole: 'worker',
      body: bodyText,
    })
    return NextResponse.json({ message })
  } catch (e: unknown) {
    if (contentTypeLower.includes('multipart/form-data')) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[worker-admin-chat] worker multipart send failed', { error: msg })
    }
    return toErrorResponse(e)
  }
}
