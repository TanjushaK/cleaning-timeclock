import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

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

async function getSiteIdFromCtx(ctx: any): Promise<string> {
  // Next 16 на build иногда типизирует params как Promise — unwrap безопасно
  const p = await Promise.resolve(ctx?.params)
  const id = String(p?.id || '').trim()
  if (!id) throw new ApiError(400, 'Missing site id')
  return id
}

export async function GET(req: Request, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const siteId = await getSiteIdFromCtx(ctx)

    const { data, error } = await supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .eq('id', siteId)
      .single()

    if (error) throw new ApiError(404, 'Объект не найден')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PUT(req: Request, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const siteId = await getSiteIdFromCtx(ctx)
    const body = await req.json().catch(() => ({}))

    const name = body?.name == null ? undefined : String(body.name).trim()
    const address = body?.address == null ? undefined : String(body.address).trim() || null

    const lat = body?.lat === undefined ? undefined : toFiniteOrNull(body.lat)
    const lng = body?.lng === undefined ? undefined : toFiniteOrNull(body.lng)

    const radiusRaw = body?.radius ?? body?.radius_m
    const radius = radiusRaw === undefined ? undefined : toFiniteOrNull(radiusRaw)

    const category = body?.category === undefined ? undefined : toCategoryOrNull(body.category)
    const notes = body?.notes === undefined ? undefined : (body.notes == null ? null : String(body.notes))

    const patch: any = {}
    if (name !== undefined) patch.name = name
    if (address !== undefined) patch.address = address
    if (lat !== undefined) patch.lat = lat
    if (lng !== undefined) patch.lng = lng
    if (radius !== undefined) patch.radius = radius
    if (category !== undefined) patch.category = category
    if (notes !== undefined) patch.notes = notes

    // Ничего не меняем — нечего апдейтить
    if (Object.keys(patch).length === 0) {
      const { data, error } = await supabase
        .from('sites')
        .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
        .eq('id', siteId)
        .single()

      if (error) throw new ApiError(404, 'Объект не найден')
      return NextResponse.json({ site: data }, { status: 200 })
    }

    // Базовая валидация
    if (patch.name !== undefined && !patch.name) throw new ApiError(400, 'Нужно название объекта')

    const { data, error } = await supabase
      .from('sites')
      .update(patch)
      .eq('id', siteId)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось обновить объект')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: Request, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const siteId = await getSiteIdFromCtx(ctx)

    // 1) Пытаемся удалить сам объект.
    // Если есть FK-ограничения — Supabase вернёт ошибку, и мы покажем понятный текст.
    const { error } = await supabase.from('sites').delete().eq('id', siteId)

    if (error) {
      // Частая причина — связанные назначения/смены. Сообщаем как есть.
      throw new ApiError(
        409,
        `Не удалось удалить объект. Скорее всего есть связанные данные (смены/назначения). Детали: ${error.message}`
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}