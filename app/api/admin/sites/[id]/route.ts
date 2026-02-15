// app/api/admin/sites/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
<<<<<<< HEAD
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
=======
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function toNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)

    const { id } = await ctx.params
    if (!id) return jsonError('Нет id', 400)

    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return jsonError(error.message, 500)
    if (!data) return jsonError('Объект не найден', 404)

    return NextResponse.json({ site: data })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка', 500)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)

    const { id } = await ctx.params
    if (!id) return jsonError('Нет id', 400)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return jsonError('Некорректное тело запроса', 400)

    // Разрешённые поля для обновления (лишнее игнорируем)
    const patch: Record<string, any> = {}

    if ('name' in body) patch.name = body.name ?? null
    if ('address' in body) patch.address = body.address ?? null
    if ('notes' in body) patch.notes = body.notes ?? null

    if ('lat' in body) patch.lat = toNumber((body as any).lat)
    if ('lng' in body) patch.lng = toNumber((body as any).lng)
    if ('radius' in body) patch.radius = toNumber((body as any).radius)

    if ('category_id' in body) patch.category_id = (body as any).category_id ?? null
    if ('archived_at' in body) patch.archived_at = (body as any).archived_at ?? null

    // если не прислали ничего полезного
    if (Object.keys(patch).length === 0) return jsonError('Нет полей для обновления', 400)
>>>>>>> 8350926 (fix build (cookies async) + supabase-route)

    const { data, error } = await supabaseAdmin
      .from('sites')
      .update(patch)
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

<<<<<<< HEAD
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
=======
    if (error) return jsonError(error.message, 500)

    return NextResponse.json({ site: data })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка обновления', 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)

    const { id } = await ctx.params
    if (!id) return jsonError('Нет id', 400)

    // По умолчанию — мягкое архивирование (без удаления строки)
    const hard = req.nextUrl.searchParams.get('hard') === '1'

    if (hard) {
      const { error } = await supabaseAdmin.from('sites').delete().eq('id', id)
      if (error) return jsonError(error.message, 500)
      return NextResponse.json({ ok: true, hard: true })
    }

    const archived_at = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('sites')
      .update({ archived_at })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return jsonError(error.message, 500)

    return NextResponse.json({ site: data, archived: true })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка', 500)
>>>>>>> 8350926 (fix build (cookies async) + supabase-route)
  }
}
