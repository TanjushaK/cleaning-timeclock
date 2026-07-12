import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CoworkerOut = {
  id: string
  name: string
  email: string | null
  role: string | null
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

async function ensureAssignmentForCoworker(db: any, siteId: string | null | undefined, workerId: string) {
  const sid = String(siteId || '').trim()
  const wid = String(workerId || '').trim()
  if (!sid || !wid) return

  const { data: existing, error: existingErr } = await db
    .from('assignments')
    .select('site_id,worker_id')
    .eq('site_id', sid)
    .eq('worker_id', wid)
    .limit(1)

  if (existingErr) throw new ApiError(400, existingErr.message, AdminApiErrorCode.DB_ERROR)
  if (Array.isArray(existing) && existing.length > 0) return

  const { error: insertErr } = await db.from('assignments').insert({ site_id: sid, worker_id: wid })
  if (!insertErr) return

  const msg = String(insertErr.message || '')
  if (/duplicate|unique/i.test(msg)) return
  throw new ApiError(400, insertErr.message, AdminApiErrorCode.DB_ERROR)
}
async function listCoworkersForJob(db: any, jobId: string): Promise<CoworkerOut[]> {
  const { data: links, error: lwErr } = await db.from('job_workers').select('worker_id').eq('job_id', jobId)
  if (lwErr) {
    const msg = String(lwErr.message || '')
    if (/does not exist|relation|schema cache/i.test(msg)) {
      throw new ApiError(400, 'job_workers table unavailable', AdminApiErrorCode.DB_ERROR)
    }
    throw new ApiError(400, lwErr.message, AdminApiErrorCode.DB_ERROR)
  }

  const ids = Array.from(
    new Set((links || []).map((r: { worker_id?: string | null }) => String(r.worker_id)).filter(Boolean))
  ) as string[]
  if (!ids.length) return []

  const { data: profs, error: pErr } = await db.from('profiles').select('id,full_name,role,active').in('id', ids)
  if (pErr) throw new ApiError(400, pErr.message, AdminApiErrorCode.DB_ERROR)

  const profById = new Map((profs || []).map((p: { id: string }) => [String(p.id), p]))
  const emails = await fetchEmailsForIds(db, ids)

  const rows: CoworkerOut[] = ids.map((id) => {
    const p = profById.get(id) as { full_name?: string | null; role?: string | null; active?: boolean | null } | undefined
    const email = emails[id] ?? null
    const full_name = p?.full_name ?? null
    return {
      id,
      name: displayName(full_name, email, id),
      email,
      role: p?.role ?? null,
      active: typeof p?.active === 'boolean' ? p.active : null,
    }
  })

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return rows
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req.headers)
    const jobId = await routeDynamicId(req, ctx)
    if (!jobId) throw new ApiError(400, 'job id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const { data: job, error: jErr } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
    if (jErr) throw new ApiError(400, jErr.message, AdminApiErrorCode.DB_ERROR)
    if (!job) throw new ApiError(404, 'Shift not found', AdminApiErrorCode.JOB_NOT_FOUND)

    const coworkers = await listCoworkersForJob(db, jobId)
    return NextResponse.json({ coworkers })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req.headers)
    const jobId = await routeDynamicId(req, ctx)
    if (!jobId) throw new ApiError(400, 'job id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const body = await req.json().catch(() => ({}))
    const worker_id = typeof body?.worker_id === 'string' ? body.worker_id.trim() : ''
    if (!worker_id) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const { data: job, error: jErr } = await db.from('jobs').select('id,worker_id,site_id').eq('id', jobId).maybeSingle()
    if (jErr) throw new ApiError(400, jErr.message, AdminApiErrorCode.DB_ERROR)
    if (!job) throw new ApiError(404, 'Shift not found', AdminApiErrorCode.JOB_NOT_FOUND)

    if (job.worker_id && String(job.worker_id) === String(worker_id)) {
      throw new ApiError(400, 'Cannot add primary employee as coworker', AdminApiErrorCode.DB_ERROR)
    }

    const { data: prof, error: pErr } = await db
      .from('profiles')
      .select('id,role,active,full_name')
      .eq('id', worker_id)
      .maybeSingle()
    if (pErr) throw new ApiError(400, pErr.message, AdminApiErrorCode.DB_ERROR)
    if (!prof) throw new ApiError(404, 'Worker profile not found', AdminApiErrorCode.PROFILE_NOT_FOUND)

    const role = String((prof as { role?: string | null }).role || '')
    if (role !== 'worker') {
      throw new ApiError(400, 'Only worker role can be added as coworker', AdminApiErrorCode.ASSIGN_CANNOT_ASSIGN_ADMIN)
    }
    if ((prof as { active?: boolean | null }).active === false) {
      throw new ApiError(400, 'Worker is inactive', AdminApiErrorCode.ASSIGN_WORKER_INACTIVE)
    }

    const { data: existing } = await db
      .from('job_workers')
      .select('worker_id')
      .eq('job_id', jobId)
      .eq('worker_id', worker_id)
      .maybeSingle()

    if (existing) {
      await ensureAssignmentForCoworker(db, job.site_id, worker_id)
      const coworkers = await listCoworkersForJob(db, jobId)
      return NextResponse.json({ ok: true, coworkers })
    }

    const { error: insErr } = await db.from('job_workers').insert({ job_id: jobId, worker_id })
    if (insErr) {
      const msg = String(insErr.message || '')
      if (/duplicate|unique/i.test(msg)) {
        const coworkers = await listCoworkersForJob(db, jobId)
        return NextResponse.json({ ok: true, coworkers })
      }
      if (/does not exist|relation|schema cache/i.test(msg)) {
        throw new ApiError(400, 'job_workers table unavailable', AdminApiErrorCode.DB_ERROR)
      }
      throw new ApiError(400, insErr.message, AdminApiErrorCode.DB_ERROR)
    }

    const coworkers = await listCoworkersForJob(db, jobId)
    return NextResponse.json({ ok: true, coworkers })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireAdmin(req.headers)
    const jobId = await routeDynamicId(req, ctx)
    if (!jobId) throw new ApiError(400, 'job id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    const body = await req.json().catch(() => ({}))
    const worker_id = typeof body?.worker_id === 'string' ? body.worker_id.trim() : ''
    if (!worker_id) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const { data: job, error: jErr } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
    if (jErr) throw new ApiError(400, jErr.message, AdminApiErrorCode.DB_ERROR)
    if (!job) throw new ApiError(404, 'Shift not found', AdminApiErrorCode.JOB_NOT_FOUND)

    const { error: delErr } = await db.from('job_workers').delete().eq('job_id', jobId).eq('worker_id', worker_id)
    if (delErr) {
      const msg = String(delErr.message || '')
      if (/does not exist|relation|schema cache/i.test(msg)) {
        throw new ApiError(400, 'job_workers table unavailable', AdminApiErrorCode.DB_ERROR)
      }
      throw new ApiError(400, delErr.message, AdminApiErrorCode.DB_ERROR)
    }

    const coworkers = await listCoworkersForJob(db, jobId)
    return NextResponse.json({ ok: true, coworkers })
  } catch (e) {
    return toErrorResponse(e)
  }
}
