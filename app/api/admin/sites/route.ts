import { NextResponse } from 'next/server'
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

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const body = await req.json()

    const name = (body?.name ?? '').toString().trim()
    const address = body?.address == null ? null : String(body.address).trim() || null

    const lat = toFiniteOrNull(body?.lat)
    const lng = toFiniteOrNull(body?.lng)
    const radius = toFiniteOrNull(body?.radius ?? body?.radius_m)
    const category = toCategoryOrNull(body?.category)
    const notes = body?.notes == null ? null : String(body.notes)

    if (!name) throw new ApiError(400, 'Нужно название объекта')

    const safeRadius = radius != null ? radius : 150

    const { data, error } = await supabase
      .from('sites')
      .insert({
        name,
        address,
        lat,
        lng,
        radius: safeRadius,
        category,
        notes,
        photos: [],
      })
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось создать объект')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
