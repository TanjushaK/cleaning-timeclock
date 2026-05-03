import { NextRequest, NextResponse } from 'next/server'

import {
  getWorkerAdminUnreadCount,
  insertWorkerAdminMessage,
  listWorkerAdminMessages,
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
  try {
    const { db, userId } = await requireActiveWorker(req)
    const workerId = userId
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
    return toErrorResponse(e)
  }
}
