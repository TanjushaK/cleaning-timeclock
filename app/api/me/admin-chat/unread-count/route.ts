import { NextRequest, NextResponse } from 'next/server'

import { getWorkerAdminUnreadCount } from '@/lib/server/worker-admin-chat'
import { requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const workerId = userId
    const unread_count = await getWorkerAdminUnreadCount(db, {
      workerId,
      userId,
      readerRole: 'worker',
    })
    return NextResponse.json({ unread_count })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
