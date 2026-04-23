import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req)
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const siteId = String(body?.site_id || '').trim()
    const archived = Boolean(body?.archived)

    if (!siteId) throw new ApiError(400, 'site_id is required', AdminApiErrorCode.SITE_ID_REQUIRED)

    const admin = guard.db
    if (archived) {
      await admin.from('assignments').delete().eq('site_id', siteId)
    }

    const patch = archived ? { archived_at: new Date().toISOString() } : { archived_at: null }
    const { data, error } = await admin
      .from('sites')
      .update(patch)
      .eq('id', siteId)
      .select('id,name,lat,lng,radius,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message, AdminApiErrorCode.DB_ERROR)
    return NextResponse.json({ ok: true, site: data })
  } catch (error) {
    return toErrorResponse(error)
  }
}
