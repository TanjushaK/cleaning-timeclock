import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type AssignmentRow = {
  site_id: string
  worker_id: string
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    const { data, error } = await guard.supabase
      .from('assignments')
      .select('site_id,worker_id')
      .order('site_id', { ascending: true })
      .order('worker_id', { ascending: true })

    if (error)
      throw new ApiError(500, error.message || 'Could not load assignments', AdminApiErrorCode.ASSIGNMENTS_LOAD_FAILED)

    return NextResponse.json({ assignments: (data ?? []) as AssignmentRow[] }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const action = String(body?.action || '').trim()
    const siteId = String(body?.site_id || '').trim()
    const workerId = String(body?.worker_id || '').trim()

    if (!action)
      throw new ApiError(400, 'action is required (assign | unassign)', AdminApiErrorCode.ASSIGN_ACTION_REQUIRED)
    if (!siteId) throw new ApiError(400, 'site_id is required', AdminApiErrorCode.SITE_ID_REQUIRED)
    if (!workerId) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const admin = guard.supabase

    if (action === 'unassign') {
      const { error } = await admin.from('assignments').delete().eq('site_id', siteId).eq('worker_id', workerId)
      if (error) throw new ApiError(500, error.message || 'Database error', AdminApiErrorCode.DB_ERROR)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action !== 'assign') {
      throw new ApiError(400, 'Unknown action (assign | unassign)', AdminApiErrorCode.ASSIGN_UNKNOWN_ACTION)
    }

    const { data: site, error: siteErr } = await admin.from('sites').select('id, archived_at').eq('id', siteId).maybeSingle()
    if (siteErr) throw new ApiError(500, siteErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)
    if (!site) throw new ApiError(404, 'Site not found', AdminApiErrorCode.SITE_NOT_FOUND)
    if ((site as any).archived_at)
      throw new ApiError(409, 'Site is archived', AdminApiErrorCode.ASSIGN_SITE_ARCHIVED)

    const { data: prof, error: profErr } = await admin.from('profiles').select('id, role, active').eq('id', workerId).maybeSingle()
    if (profErr) throw new ApiError(500, profErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)
    if (!prof) throw new ApiError(404, 'Profile not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
    if ((prof as any).role === 'admin')
      throw new ApiError(409, 'Cannot assign an admin', AdminApiErrorCode.ASSIGN_CANNOT_ASSIGN_ADMIN)
    if ((prof as any).active === false)
      throw new ApiError(409, 'Worker is not active', AdminApiErrorCode.ASSIGN_WORKER_INACTIVE)

    const { error: delErr } = await admin.from('assignments').delete().eq('site_id', siteId).eq('worker_id', workerId)
    if (delErr) throw new ApiError(500, delErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    const { data: ins, error: insErr } = await admin
      .from('assignments')
      .insert({ site_id: siteId, worker_id: workerId })
      .select('site_id,worker_id')
      .single()

    if (insErr) throw new ApiError(500, insErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true, assignment: ins as AssignmentRow }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
