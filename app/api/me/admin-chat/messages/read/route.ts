import { NextRequest, NextResponse } from 'next/server'

import { markWorkerAdminMessagesRead } from '@/lib/server/worker-admin-chat'
import { requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const workerId = userId
    await markWorkerAdminMessagesRead(db, { workerId, userId, readerRole: 'worker' })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
