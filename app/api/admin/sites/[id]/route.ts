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

async function getId(params: any): Promise<string> {
  const p = await params
  const id = (p?.id ?? '').toString().trim()
  if (!id) throw new ApiError(400, 'Missing site id')
  return id
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const id = await getId((ctx as any).params)

    const { data, error } = await supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at,created_at,updated_at')
      .eq('id', id)
      .single()

    if (error) throw new ApiError(404, 'Объект не найден')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const id = await getId((ctx as any).params)

    const body = await req.json().catch(() => ({} as any))

    const name = body?.name == null ? undefined : String(body.name).trim()
    const address = body?.address === undefined ? undefined : (body?.address == null ? null : String(body.address).trim() || null)

    const lat = body?.lat === undefined ? undefined : toFiniteOrNull(body?.lat)
    const lng = body?.lng === undefined ? undefined : toFiniteOrNull(body?.lng)
    const radius = body?.radius === undefined && body?.radius_m === undefined ? undefined : toFiniteOrNull(body?.radius ?? body?.radius_m)
    const category = body?.category === undefined ? undefined : toCategoryOrNull(body?.category)
    const notes = body?.notes === undefined ? undefined : (body?.notes == null ? null : String(body.notes))

    // не даём случайно затереть name в пустоту
    if (name !== undefined && !name) throw new ApiError(400, 'Нужно название объекта')

    const patch: any = {}
    if (name !== undefined) patch.name = name
    if (address !== undefined) patch.address = address
    if (lat !== undefined) patch.lat = lat
    if (lng !== undefined) patch.lng = lng
    if (radius !== undefined) patch.radius = radius ?? 150
    if (category !== undefined) patch.category = category
    if (notes !== undefined) patch.notes = notes

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

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const id = await getId((ctx as any).params)

    // Сначала проверим, что объект существует (и чтобы сообщение было человеческое)
    const { data: exists, error: exErr } = await supabase.from('sites').select('id').eq('id', id).single()
    if (exErr || !exists?.id) throw new ApiError(404, 'Объект не найден')

    const { error } = await supabase.from('sites').delete().eq('id', id)

    // Если у тебя есть FK на jobs/assignments — тут может вылезти ошибка.
    // Тогда правильнее архивировать вместо удаления или сначала удалять связанные записи.
    if (error) throw new ApiError(400, error.message || 'Не удалось удалить объект')

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}