import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

type SitePhoto = { path: string; url?: string; created_at?: string | null }

const BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'

function getSignedTtlSeconds() {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL
  const n = raw ? Number.parseInt(raw, 10) : 86400
  return Number.isFinite(n) && n > 0 ? n : 86400
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
  if (i < 1 || i > 15) throw new ApiError(400, 'Категория должна быть от 1 до 15')
  return i
}

function normalizePhotos(v: any): SitePhoto[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((p) => p && typeof p === 'object' && typeof (p as any).path === 'string')
    .map((p) => ({
      path: String((p as any).path),
      url: (p as any).url ? String((p as any).url) : undefined,
      created_at: (p as any).created_at ? String((p as any).created_at) : undefined,
    }))
}

async function withSignedUrls(supabase: any, site: any) {
  const photos = normalizePhotos(site?.photos)
  if (photos.length === 0) return { ...site, photos }

  const paths = Array.from(new Set(photos.map((p) => p.path).filter(Boolean)))
  const ttl = getSignedTtlSeconds()
  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl)

  if (error || !Array.isArray(signed)) {
    return { ...site, photos }
  }

  const urlByPath = new Map<string, string>()
  for (const item of signed as any[]) {
    const p = item?.path ? String(item.path) : ''
    const u = item?.signedUrl ? String(item.signedUrl) : ''
    if (p && u) urlByPath.set(p, u)
  }

  return {
    ...site,
    photos: photos.map((p) => ({ ...p, url: urlByPath.get(p.path) || p.url })),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { data, error } = await supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .eq('id', id)
      .single()

    if (error) throw new ApiError(400, error.message || 'Не удалось загрузить объект')

    const site = await withSignedUrls(supabase, data)
    return NextResponse.json({ site })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim()
      if (!name) throw new ApiError(400, 'Нужно название объекта')
      updates.name = name
    }

    if (body.address !== undefined) {
      const address = body.address == null ? null : String(body.address).trim() || null
      updates.address = address
    }

    if (body.lat !== undefined) updates.lat = toFiniteOrNull(body.lat)
    if (body.lng !== undefined) updates.lng = toFiniteOrNull(body.lng)

    if (body.radius !== undefined || body.radius_m !== undefined) {
      const r = toFiniteOrNull(body.radius ?? body.radius_m)
      updates.radius = r == null ? 150 : r
    }

    if (body.category !== undefined) updates.category = toCategoryOrNull(body.category)

    if (body.notes !== undefined) {
      updates.notes = body.notes == null ? null : String(body.notes)
    }

    if (Object.keys(updates).length === 0) throw new ApiError(400, 'no_updates')

    const { data, error } = await supabase
      .from('sites')
      .update(updates)
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(400, error.message || 'Не удалось обновить объект')

    const site = await withSignedUrls(supabase, data)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { error } = await supabase.from('sites').delete().eq('id', id)
    if (error) throw new ApiError(400, error.message || 'Не удалось удалить объект')

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
