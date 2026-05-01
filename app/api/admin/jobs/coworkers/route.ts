import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_JOB_IDS = 500

type CoworkerOut = {
  id: string
  name: string
  email: string | null
  active: boolean | null
}

function displayName(full_name: string | null | undefined, email: string | null | undefined, id: string) {
  const n = String(full_name || '').trim()
  if (n) return n
  const e = String(email || '').trim()
  if (e) return e
  return id.slice(0, 8)
}

async function fetchEmailsForIds(db: any, ids: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  for (const id of ids) {
    try {
      const { data, error } = await db.auth.admin.getUserById(id)
      if (!error && data?.user?.email) map[id] = String(data.user.email)
    } catch {
      // ignore per-id failures
    }
  }
  return map
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req.headers)
    const body = await req.json().catch(() => ({}))
    const raw = body?.job_ids
    if (!Array.isArray(raw)) {
      throw new ApiError(400, 'job_ids must be an array', AdminApiErrorCode.DB_ERROR)
    }

    const seen = new Set<string>()
    const job_ids: string[] = []
    for (const x of raw) {
      const id = typeof x === 'string' ? x.trim() : ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      job_ids.push(id)
      if (job_ids.length > MAX_JOB_IDS) {
        throw new ApiError(400, `job_ids: maximum ${MAX_JOB_IDS} ids`, AdminApiErrorCode.DB_ERROR)
      }
    }

    if (job_ids.length === 0) {
      return NextResponse.json({ coworkersByJob: {} as Record<string, CoworkerOut[]> })
    }

    const { data: links, error: lwErr } = await db
      .from('job_workers')
      .select('job_id,worker_id')
      .in('job_id', job_ids)

    if (lwErr) {
      const msg = String(lwErr.message || '')
      if (/does not exist|relation|schema cache/i.test(msg)) {
        throw new ApiError(400, 'job_workers table unavailable', AdminApiErrorCode.DB_ERROR)
      }
      throw new ApiError(400, lwErr.message, AdminApiErrorCode.DB_ERROR)
    }

    const byJob = new Map<string, Set<string>>()
    for (const jid of job_ids) {
      byJob.set(jid, new Set())
    }

    for (const r of links || []) {
      const row = r as { job_id?: string | null; worker_id?: string | null }
      const jid = row.job_id ? String(row.job_id) : ''
      const wid = row.worker_id ? String(row.worker_id) : ''
      if (!jid || !wid || !byJob.has(jid)) continue
      byJob.get(jid)!.add(wid)
    }

    const allWorkerIds = new Set<string>()
    for (const s of byJob.values()) {
      for (const id of s) allWorkerIds.add(id)
    }

    const profilesById = new Map<string, { full_name?: string | null; active?: boolean | null }>()
    const widList = Array.from(allWorkerIds)

    if (widList.length) {
      const { data: profs, error: pErr } = await db.from('profiles').select('id,full_name,active').in('id', widList)
      if (pErr) throw new ApiError(400, pErr.message, AdminApiErrorCode.DB_ERROR)
      for (const p of profs || []) {
        const id = String((p as { id: string }).id)
        profilesById.set(id, p as { full_name?: string | null; active?: boolean | null })
      }
    }

    const emails = widList.length ? await fetchEmailsForIds(db, widList) : {}

    function rowForWorker(id: string): CoworkerOut {
      const p = profilesById.get(id)
      const email = emails[id] ?? null
      const full_name = p?.full_name ?? null
      return {
        id,
        name: displayName(full_name, email, id),
        email,
        active: typeof p?.active === 'boolean' ? p.active : null,
      }
    }

    const coworkersByJob: Record<string, CoworkerOut[]> = {}
    for (const jid of job_ids) {
      const ids = Array.from(byJob.get(jid) || [])
      const rows = ids.map(rowForWorker)
      rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      coworkersByJob[jid] = rows
    }

    return NextResponse.json({ coworkersByJob })
  } catch (e) {
    return toErrorResponse(e)
  }
}
