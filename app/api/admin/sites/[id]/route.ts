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

    const { data, error } = await supabase.from('sites').select('*').eq('id', id).single()
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ site: data })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PUT(
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

    const updates: any = {}

    if (typeof body.name === 'string') updates.name = body.name.trim()
    if (typeof body.address === 'string') updates.address = body.address.trim()

    if (body.lat === null || typeof body.lat === 'number') updates.lat = body.lat
    if (body.lng === null || typeof body.lng === 'number') updates.lng = body.lng

    if (body.radius === null || typeof body.radius === 'number') updates.radius = body.radius

    if (Object.keys(updates).length === 0) throw new ApiError(400, 'no_updates')

    const { data, error } = await supabase
      .from('sites')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true, site: data })
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

    const { error } = await supabase.from('sites').delete().eq('id', id)
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
