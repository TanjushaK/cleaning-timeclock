// app/api/admin/workers/anonymize/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, dbService, toErrorResponse } from '@/lib/route-db'

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const workerId = String(body?.worker_id || '').trim()
    if (!workerId) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    if (workerId === guard.userId) {
      throw new ApiError(409, 'Cannot anonymize yourself', AdminApiErrorCode.ANONYMIZE_SELF_FORBIDDEN)
    }

    const admin = dbService()

    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', workerId)
      .maybeSingle()

    if (profErr || !prof) throw new ApiError(404, 'Profile not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
    if (prof.role === 'admin')
      throw new ApiError(409, 'Cannot anonymize an admin', AdminApiErrorCode.ANONYMIZE_ADMIN_FORBIDDEN)

    const { error: asErr } = await admin.from('assignments').delete().eq('worker_id', workerId)
    if (asErr) throw new ApiError(500, asErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    const patch: any = {
      active: false,
      role: 'worker',
      full_name: 'Removed worker',
      phone: null,
      avatar_url: null,
    }

    const { error: updErr } = await admin.from('profiles').update(patch).eq('id', workerId)
    if (updErr) throw new ApiError(500, updErr.message || 'Database error', AdminApiErrorCode.DB_ERROR)

    const { error: authErr } = await admin.auth.admin.deleteUser(workerId)
    if (authErr) {
      const msg = String(authErr.message || '')
      const notFound = /not\s*found/i.test(msg) || /User\s*not\s*found/i.test(msg)
      if (!notFound) {
        return NextResponse.json(
          {
            ok: true,
            warning: `Profile anonymized but auth user was not deleted: ${msg}`,
            errorCode: AdminApiErrorCode.ANONYMIZE_AUTH_DELETE_PARTIAL,
          },
          { status: 200 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
