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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim()
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
  const item = Array.isArray(data) && data.length > 0 ? data[0] : null
  const lat = Number(item?.lat)
  const lng = Number(item?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return { lat, lng }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const body = await req.json()

    const name = (body?.name ?? '').toString().trim()
    const address = body?.address == null ? null : String(body.address).trim() || null

    let lat = toFiniteOrNull(body?.lat)
    let lng = toFiniteOrNull(body?.lng)

    const radius = toFiniteOrNull(body?.radius ?? body?.radius_m)
    const category = toCategoryOrNull(body?.category)
    const notes = body?.notes == null ? null : String(body.notes)

    if (!name) throw new ApiError(400, 'Нужно название объекта')

    const safeRadius = radius != null ? radius : 150

    // Авто-геокодинг: если есть адрес и нет координат — пытаемся получить lat/lng
    if (address && (lat == null || lng == null)) {
      const geo = await geocodeAddress(address)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
      }
    }

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
