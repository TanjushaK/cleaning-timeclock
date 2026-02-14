import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, first_name, last_name, phone, address, notes, avatar_url')
      .eq('id', id)
      .single()

    if (pErr) throw new ApiError(400, pErr.message)

    const { data: authUser, error: aErr } = await supabase.auth.admin.getUserById(id)
    if (aErr) throw new ApiError(400, aErr.message)

    return NextResponse.json({
      worker: {
        ...prof,
        email: authUser?.user?.email ?? null,
      },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new ApiError(400, 'invalid_body')

    const updates: any = {}

    // профиль
    for (const k of ['first_name', 'last_name', 'phone', 'address', 'notes', 'avatar_url']) {
      if (typeof (body as any)[k] === 'string') updates[k] = String((body as any)[k]).trim() || null
      if ((body as any)[k] === null) updates[k] = null
    }

    // поддержка full_name как legacy-поля (если оно ещё используется в UI)
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      const fn = updates.first_name ?? null
      const ln = updates.last_name ?? null
      const full = `${fn || ''} ${ln || ''}`.trim()
      updates.full_name = full || null
    }

    if (Object.keys(updates).length === 0) throw new ApiError(400, 'no_updates')

    const { data: out, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('id, role, active, full_name, first_name, last_name, phone, address, notes, avatar_url')
      .single()

    if (error) throw new ApiError(400, error.message)

    const { data: authUser } = await supabase.auth.admin.getUserById(id)

    return NextResponse.json({
      ok: true,
      worker: { ...out, email: authUser?.user?.email ?? null },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
