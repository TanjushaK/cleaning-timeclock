import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req)
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const siteId = String(body?.site_id || '').trim()
    if (!siteId) throw new ApiError(400, 'site_id is required', AdminApiErrorCode.SITE_ID_REQUIRED)

    const admin = guard.db
    const { data: jobsHit, error: jobsErr } = await admin.from('jobs').select('id').eq('site_id', siteId).limit(1)
    if (jobsErr) throw new ApiError(500, jobsErr.message, AdminApiErrorCode.DB_ERROR)
    if (jobsHit && Array.isArray(jobsHit) && jobsHit.length > 0) {
      throw new ApiError(
        409,
        'Cannot delete site: jobs exist. Archive the site or clear data.',
        AdminApiErrorCode.SITE_DELETE_HAS_JOBS,
      )
    }

    await admin.from('assignments').delete().eq('site_id', siteId)
    const { error: delErr } = await admin.from('sites').delete().eq('id', siteId)
    if (delErr) throw new ApiError(500, delErr.message, AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
