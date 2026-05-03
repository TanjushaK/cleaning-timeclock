// app/api/me/jobs/team/route.ts
import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import {
  expandTeamsByJob,
  fetchJobWorkerLinksByJob,
  normalizeWorkerId,
  workerDisplayLabel,
  type WorkerProfileLite,
} from '@/lib/job-shift-team'
import { workerApiErrorResponse } from '@/lib/worker-api-response'
import { requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  worker_id: string | null
  job_date?: string | null
  site_id?: string | null
  scheduled_time?: string | null
  scheduled_end_time?: string | null
  status?: string | null
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export async function GET(req: Request) {
  try {
    const guard = await requireActiveWorker(req)
    const db = guard.db
    const uid = guard.userId

    const jobIds = new Set<string>()

    const { data: directJobs, error: directErr } = await db.from('jobs').select('id').eq('worker_id', uid)
    if (directErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, directErr.message)
    for (const j of (directJobs as Array<{ id: string }> | null) || []) jobIds.add(normalizeWorkerId(j.id))

    const { data: links, error: linksErr } = await db.from('job_workers').select('job_id').eq('worker_id', uid)
    if (linksErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, linksErr.message)
    for (const r of (links as Array<{ job_id: string | null }> | null) || []) {
      if (r.job_id) jobIds.add(normalizeWorkerId(r.job_id))
    }

    const ids = Array.from(jobIds).filter(Boolean)
    if (!ids.length) return NextResponse.json({ teams: {} }, { status: 200 })

    let jobs: JobRow[] = []
    {
      const { data, error } = await db
        .from('jobs')
        .select('id,worker_id,job_date,site_id,scheduled_time,scheduled_end_time,status')
        .in('id', ids)
      if (error && String(error.message || '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await db
          .from('jobs')
          .select('id,worker_id,job_date,site_id,scheduled_time,status')
          .in('id', ids)
        if (e2) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, e2.message)
        jobs = (d2 as unknown as JobRow[] | null) || []
      } else {
        if (error) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, error.message)
        jobs = (data as unknown as JobRow[] | null) || []
      }
    }

    const linksByJob = await fetchJobWorkerLinksByJob(db, ids)

    let teamsMap: Map<string, Set<string>>
    try {
      teamsMap = await expandTeamsByJob(db, jobs as unknown[], linksByJob)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, msg)
    }

    const workerIds = new Set<string>()
    for (const id of ids) {
      for (const wid of teamsMap.get(id) || []) workerIds.add(wid)
    }

    const profilesById: Record<string, WorkerProfileLite> = {}
    const wids = Array.from(workerIds)

    for (const part of chunk(wids, 200)) {
      const { data: ps, error: pErr } = await db.from('profiles').select('id,full_name,email').in('id', part)
      if (pErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, pErr.message)
      for (const p of (ps as unknown as WorkerProfileLite[] | null) || []) {
        if (p && p.id) profilesById[p.id] = p
      }
    }

    const teams: Record<string, Array<{ id: string; name: string }>> = {}

    for (const id of ids) {
      const xs = Array.from(teamsMap.get(id) || []).sort((a, b) => a.localeCompare(b))
      teams[id] = xs.map((wid) => ({
        id: wid,
        name: workerDisplayLabel(profilesById[wid], wid),
      }))
    }

    return NextResponse.json({ teams }, { status: 200 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
