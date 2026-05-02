import { NextRequest, NextResponse } from 'next/server'

import { listUnreadCountsForJobs } from '@/lib/server/job-shift-chat'
import { workerCanAccessJob } from '@/lib/server/worker-job-access'
import { requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_JOB_IDS = 400

export async function POST(req: NextRequest) {
  try {
    const { db, userId } = await requireActiveWorker(req)
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const raw = body?.jobIds
    const jobIds = Array.isArray(raw)
      ? raw.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, MAX_JOB_IDS)
      : []

    const allowed = new Set<string>()
    for (const id of jobIds) {
      if (await workerCanAccessJob(db, userId, id)) allowed.add(id)
    }

    const batch = await listUnreadCountsForJobs(db, {
      jobIds: Array.from(allowed),
      userId,
      readerRole: 'worker',
    })

    const counts: Record<string, number> = {}
    for (const id of jobIds) {
      counts[id] = allowed.has(id) ? batch[id] ?? 0 : 0
    }

    return NextResponse.json({ counts })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
