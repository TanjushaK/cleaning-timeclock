import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type SitePhoto = { path?: string; url?: string; created_at?: string } | string

function s(v: any) {
  return String(v ?? '').trim()
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toIntOrDefault(v: any, def: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  const i = Math.round(n)
  return i > 0 ? i : def
}

function isRelMissing(err: any): boolean {
  const msg = String(err?.message || '')
  const code = String(err?.code || '')
  return code === '42P01' || msg.includes('does not exist') || msg.includes('relation') && msg.includes('does not exist')
}

function getTtlSeconds(): number {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL || '86400'
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400
}

function getBucket(): string {
  return process.env.SITE_PHOTOS_BUCKET || 'site-photos'
}

async function geocodeAddress(addr: string): Promise<{ lat: number; lng: number } | null> {
  const q = addr.trim()
  if (!q) return null

  const ua =
    process.env.NOMINATIM_USER_AGENT ||
    'Tanija Cleaning Timeclock (geocode); contact=admin@tanjusha.nl'

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`

  const r = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept-Language': 'en,ru;q=0.8',
    },
    cache: 'no-store',
  })

  if (!r.ok) return null

  const data = (await r.json()) as any
  if (!Array.isArray(data) || data.length === 0) return null

  const item = data[0]
  const lat = Number(item?.lat)
  const lng = Number(item?.lon)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

async function signPhotos(supabase: any, photosRaw: any): Promise<any[]> {
  const bucket = getBucket()
  const ttl = getTtlSeconds()

  const arr: any[] = Array.isArray(photosRaw) ? photosRaw : []
  const out: any[] = []

  for (const p of arr) {
    if (typeof p === 'string') {
      const path = p
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, ttl)
      out.push({ path, url: data?.signedUrl || null })
      continue
    }

    const path = s(p?.path)
    const created_at = p?.created_at || null

    if (!path) {
      out.push(p)
      continue
    }

    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, ttl)
    out.push({ path, url: data?.signedUrl || null, created_at })
  }

  return out
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id } = await ctx.params

    const { data, error } = await supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .eq('id', id)
      .single()

    if (error) throw new ApiError(404, 'Объект не найден')

    const photos = await signPhotos(supabase, (data as any)?.photos)
    return NextResponse.json({ site: { ...(data as any), photos } }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id } = await ctx.params

    const body = await req.json()

    const name = body?.name !== undefined ? s(body.name) : undefined
    const address = body?.address !== undefined ? s(body.address) : undefined
    const notes = body?.notes !== undefined ? s(body.notes) : undefined

    const radius =
      body?.radius !== undefined ? toIntOrDefault(body.radius, 150) : undefined

    const category =
      body?.category !== undefined ? (body.category === null ? null : s(body.category)) : undefined

    let lat = body?.lat !== undefined ? toNumOrNull(body.lat) : undefined
    let lng = body?.lng !== undefined ? toNumOrNull(body.lng) : undefined

    // Автогеокодинг: если адрес пришёл, а lat/lng не пришли — пробуем найти координаты
    if (address !== undefined && lat === undefined && lng === undefined) {
      const geo = await geocodeAddress(address)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
      } else {
        // если не нашли — просто сохраняем адрес, GPS останется пустым
        lat = null
        lng = null
      }
    }

    const patch: any = {}
    if (name !== undefined) patch.name = name
    if (address !== undefined) patch.address = address
    if (notes !== undefined) patch.notes = notes
    if (radius !== undefined) patch.radius = radius
    if (category !== undefined) patch.category = category
    if (lat !== undefined) patch.lat = lat
    if (lng !== undefined) patch.lng = lng

    const { data, error } = await supabase
      .from('sites')
      .update(patch)
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось сохранить объект')

    const photos = await signPhotos(supabase, (data as any)?.photos)
    return NextResponse.json({ site: { ...(data as any), photos } }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id } = await ctx.params

    // 1) Отвязываем jobs (вариант 3)
    const j = await supabase.from('jobs').update({ site_id: null }).eq('site_id', id)
    if (j.error) throw new ApiError(500, j.error.message || 'Не удалось отвязать jobs от объекта')

    // 2) Чистим assignments (если есть)
    const a = await supabase.from('assignments').delete().eq('site_id', id)
    if (a.error && !isRelMissing(a.error)) {
      throw new ApiError(500, a.error.message || 'Не удалось удалить assignments объекта')
    }

    // 3) Удаляем объект
    const del = await supabase
      .from('sites')
      .delete()
      .eq('id', id)
      .select('id')
      .single()

    if (del.error) throw new ApiError(500, del.error.message || 'Не удалось удалить объект')

    return NextResponse.json({ ok: true, id }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
