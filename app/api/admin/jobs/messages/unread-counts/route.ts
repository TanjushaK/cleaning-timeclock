import { NextRequest, NextResponse } from 'next/server'

import { listUnreadCountsForJobs } from '@/lib/server/job-shift-chat'
import { requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_JOB_IDS = 400

export async function POST(req: NextRequest) {
  try {
    const { db, userId } = await requireAdmin(req)
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const raw = body?.jobIds
    const jobIds = Array.isArray(raw)
      ? raw.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, MAX_JOB_IDS)
      : []
    if (!jobIds.length) return NextResponse.json({ counts: {} as Record<string, number> })

    const counts = await listUnreadCountsForJobs(db, {
      jobIds,
      userId,
      readerRole: 'admin',
    })

    return NextResponse.json({ counts })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
