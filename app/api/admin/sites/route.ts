import { NextResponse } from 'next/server'
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
  if (i < 1 || i > 15) return null
  return i
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)
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

    if (error) throw new ApiError(500, error.message || 'Не смогла создать объект')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
=======
import { requireAdmin } from '@/lib/require-admin'
import { supabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'
const SIGNED_URL_TTL = Number(process.env.SITE_PHOTOS_SIGNED_URL_TTL || '3600')

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

async function signPhotos(photos: SitePhoto[] | null): Promise<SitePhoto[] | null> {
  if (!photos || photos.length === 0) return photos

  const out: SitePhoto[] = []
  for (const p of photos) {
    if (!p?.path) continue
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p.path, SIGNED_URL_TTL)
    out.push({
      ...p,
      url: data?.signedUrl || p.url || '',
    })
  }
  return out
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  const u = new URL(req.url)
  const includeArchived = u.searchParams.get('include_archived') === '1'

  let q = supabaseAdmin
    .from('sites')
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .order('name', { ascending: true })

  if (!includeArchived) q = q.is('archived_at', null)

  const { data, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sites = (data as SiteRow[]).map((s) => ({ ...s }))
  for (const s of sites) {
    s.photos = await signPhotos(s.photos)
  }

  return NextResponse.json({ sites })
>>>>>>> 8350926 (fix build (cookies async) + supabase-route)
}
