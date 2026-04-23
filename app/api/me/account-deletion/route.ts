import { NextRequest, NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiError, requireUser, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Worker-initiated account deletion **request** (not immediate erase).
 * Operator processes asynchronously; satisfies Apple “initiate in app” expectation.
 */
export async function POST(req: NextRequest) {
  try {
    const { db, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const note = typeof body?.note === 'string' ? String(body.note).slice(0, 4000) : null

    const { data: pending, error: pendErr } = await db
      .from('account_deletion_requests')
      .select('id,status,created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendErr) throw new ApiError(400, pendErr.message, AppApiErrorCodes.ACCOUNT_DELETION_CREATE_FAILED)

    if (pending?.id) {
      return NextResponse.json({
        ok: true,
        already_pending: true,
        request_id: pending.id,
        status: 'pending',
        created_at: pending.created_at,
      })
    }

    const { data, error } = await db
      .from('account_deletion_requests')
      .insert({ user_id: userId, note })
      .select('id,status,created_at')
      .single()

    if (error || !data) {
      throw new ApiError(400, error?.message || 'insert failed', AppApiErrorCodes.ACCOUNT_DELETION_CREATE_FAILED)
    }

    return NextResponse.json({
      ok: true,
      already_pending: false,
      request_id: data.id,
      status: data.status,
      created_at: data.created_at,
    })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const { db, userId } = await requireUser(req)

    const { data, error } = await db
      .from('account_deletion_requests')
      .select('id,status,created_at,note')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new ApiError(400, error.message, AppApiErrorCodes.ACCOUNT_DELETION_LIST_FAILED)

    return NextResponse.json({ request: data ?? null })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
