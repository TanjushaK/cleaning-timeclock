import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { data, error } = await supabase
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

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

    const { data, error } = await supabase
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
