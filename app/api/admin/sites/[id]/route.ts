import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

function toFiniteOrNull(v: any): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toCategoryOrNull(v: any): number | null {
  if (v == null || v === '' || v === 0 || v === '0') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i < 1 || i > 15) throw new ApiError(400, 'Категория должна быть от 1 до 15')
  return i
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id } = await ctx.params

    const body = await req.json()

    const patch: Record<string, any> = {}

    if (body?.name !== undefined) {
      const name = String(body.name ?? '').trim()
      if (!name) throw new ApiError(400, 'Нужно название объекта')
      patch.name = name
    }

    if (body?.address !== undefined) {
      const address = body.address == null ? null : String(body.address).trim() || null
      patch.address = address
    }

    if (body?.lat !== undefined) patch.lat = toFiniteOrNull(body.lat)
    if (body?.lng !== undefined) patch.lng = toFiniteOrNull(body.lng)

    if (body?.radius !== undefined || body?.radius_m !== undefined) {
      const r = toFiniteOrNull(body?.radius ?? body?.radius_m)
      patch.radius = r == null ? 150 : r
    }

    if (body?.category !== undefined) {
      patch.category = toCategoryOrNull(body.category)
    }

    if (body?.notes !== undefined) {
      patch.notes = body.notes == null ? null : String(body.notes)
    }

    if (body?.archived_at !== undefined) {
      patch.archived_at = body.archived_at == null || body.archived_at === '' ? null : String(body.archived_at)
    }

    if (Object.keys(patch).length === 0) throw new ApiError(400, 'Нет полей для обновления')

    const { data, error } = await supabase
      .from('sites')
      .update(patch)
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось обновить объект')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id } = await ctx.params

    const { data, error } = await supabase
      .from('sites')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось удалить объект')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
