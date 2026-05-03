import { NextRequest, NextResponse } from 'next/server'

import { listWorkerAdminThreads } from '@/lib/server/worker-admin-chat'
import { requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { db, userId } = await requireAdmin(req)
    const threads = await listWorkerAdminThreads(db, userId)
    return NextResponse.json({ threads })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
