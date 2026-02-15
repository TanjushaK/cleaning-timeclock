// app/api/admin/sites/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

type SitePhoto = { path: string; url?: string; created_at?: string }
type SiteRow = {
  id: string
  name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  radius: number | null
  category: number | null
  notes: string | null
  photos: SitePhoto[] | null
  archived_at: string | null
}

const BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'
const SIGNED_URL_TTL = Number(process.env.SITE_PHOTOS_SIGNED_URL_TTL || '3600')

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

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
  if (i < 1 || i > 15) return null
  return i
}

async function signPhotos(photos: SitePhoto[] | null): Promise<SitePhoto[] | null> {
  if (!photos || photos.length === 0) return photos

  const out: SitePhoto[] = []
  for (const p of photos) {
    if (!p?.path) continue
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p.path, SIGNED_URL_TTL)
    out.push({ ...p, url: data?.signedUrl || p.url || '' })
  }
  return out
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  allowIdOrError(id)

  const { data, error } = await supabaseAdmin
    .from('sites')
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('Объект не найден', 404)

  const site = data as SiteRow
  site.photos = await signPhotos(site.photos)

  return NextResponse.json({ site }, { status: 200 })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  allowIdOrError(id)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return jsonError('Некорректное тело запроса', 400)

  const patch: Record<string, any> = {}

  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) return jsonError('Нужно название объекта', 400)
    patch.name = name
  }

  if (body?.address !== undefined) {
    patch.address = body.address == null ? null : String(body.address).trim() || null
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

  if (Object.keys(patch).length === 0) return jsonError('Нет полей для обновления', 400)

  const { data, error } = await supabaseAdmin
    .from('sites')
    .update(patch)
    .eq('id', id)
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .single()

  if (error) return jsonError(error.message || 'Не удалось обновить объект', 500)

  const site = data as SiteRow
  site.photos = await signPhotos(site.photos)

  return NextResponse.json({ site }, { status: 200 })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  allowIdOrError(id)

  // мягкое архивирование
  const archived_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('sites')
    .update({ archived_at })
    .eq('id', id)
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .single()

  if (error) return jsonError(error.message || 'Не удалось удалить объект', 500)

  const site = data as SiteRow
  site.photos = await signPhotos(site.photos)

  return NextResponse.json({ site }, { status: 200 })
}

function allowIdOrError(id: string) {
  if (!id) throw new Error('Нет id')
}
