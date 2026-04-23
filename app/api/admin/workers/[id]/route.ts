import { NextRequest, NextResponse } from 'next/server'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { ApiError, requireAdmin } from '@/lib/route-db'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'id_required')

    const { db } = await requireAdmin(req.headers)

    const { data, error } = await db
      .from('profiles')
      .select('id, full_name, phone, role')
      .eq('id', id)
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ worker: data })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'id_required')

    const { db } = await requireAdmin(req.headers)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }
    if (!body || typeof body !== 'object') throw new ApiError(400, 'invalid_body')

    const updates: Partial<{
      full_name: string
      phone: string
      role: 'admin' | 'worker'
    }> = {}

    if (typeof body.full_name === 'string') updates.full_name = body.full_name.trim()
    if (typeof body.phone === 'string') updates.phone = body.phone.trim()
    if (body.role === 'admin' || body.role === 'worker') updates.role = body.role

    if (Object.keys(updates).length === 0) throw new ApiError(400, 'no_updates')

    const { data, error } = await db
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('id, full_name, phone, role')
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true, worker: data })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'id_required')

    const { db } = await requireAdmin(req.headers)

    const { error } = await db.from('profiles').delete().eq('id', id)
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
