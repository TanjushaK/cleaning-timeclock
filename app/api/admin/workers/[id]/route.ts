import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

type WorkerRow = {
  id: string
  email: string | null
  role: string | null
  active: boolean | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  address: string | null
  phone: string | null
  avatar_url: string | null
  notes: string | null
}

function toNullableString(v: unknown): string | null {
  if (v == null) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

async function getEmail(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (error) return null
    return data?.user?.email || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, first_name, last_name, address, phone, avatar_url, notes')
      .eq('id', id)
      .single()

    if (error) throw new ApiError(400, error.message)

    const email = await getEmail(supabase, id)

    return NextResponse.json({ worker: { ...(data as any), email } as WorkerRow }, { status: 200 })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const updates: Record<string, any> = {}

    if ('first_name' in body) updates.first_name = toNullableString(body.first_name)
    if ('last_name' in body) updates.last_name = toNullableString(body.last_name)
    if ('address' in body) updates.address = toNullableString(body.address)
    if ('phone' in body) updates.phone = toNullableString(body.phone)
    if ('avatar_url' in body) updates.avatar_url = toNullableString(body.avatar_url)
    if ('notes' in body) updates.notes = toNullableString(body.notes)

    // full_name можно прислать напрямую, но если нет — соберём из имени/фамилии
    if ('full_name' in body) {
      updates.full_name = toNullableString(body.full_name)
    } else {
      const fn = typeof body.first_name === 'string' ? body.first_name.trim() : ''
      const ln = typeof body.last_name === 'string' ? body.last_name.trim() : ''
      const combined = [fn, ln].filter(Boolean).join(' ').trim()
      if (combined) updates.full_name = combined
    }

    // роль — оставим поддержку (у вас уже используется)
    if (body.role === 'admin' || body.role === 'worker') updates.role = body.role

    if (Object.keys(updates).length === 0) throw new ApiError(400, 'no_updates')

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('id, role, active, full_name, first_name, last_name, address, phone, avatar_url, notes')
      .single()

    if (error) throw new ApiError(400, error.message)

    const email = await getEmail(supabase, id)

    return NextResponse.json({ ok: true, worker: { ...(data as any), email } as WorkerRow }, { status: 200 })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
