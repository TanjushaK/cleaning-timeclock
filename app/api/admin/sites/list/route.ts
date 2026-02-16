import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, ApiError, toErrorResponse } from '@/lib/require-admin'

type SitePhotoOut = { path: string; url: string; created_at?: string }
type SiteRow = {
  id: string
  name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  radius: number | null
  category: number | null
  notes: string | null
  photos: any
  archived_at: string | null
}

function envBucket() {
  return (process.env.SITE_PHOTOS_BUCKET || 'site-photos').trim()
}

function envTtl() {
  const raw = String(process.env.SITE_PHOTOS_SIGNED_URL_TTL || '').trim()
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function normPhotos(raw: any): { path: string; created_at?: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { path: string; created_at?: string }[] = []
  for (const p of raw) {
    if (typeof p === 'string') {
      const path = p.trim()
      if (path) out.push({ path })
      continue
    }
    if (p && typeof p === 'object') {
      const path = String((p as any).path || '').trim()
      if (!path) continue
      const created_at = String((p as any).created_at || '').trim() || undefined
      out.push({ path, created_at })
    }
  }
  return out
}

async function photoUrl(supabase: any, bucket: string, path: string, ttl: number): Promise<string> {
  if (ttl > 0) {
    const signed = await supabase.storage.from(bucket).createSignedUrl(path, ttl)
    const u = signed?.data?.signedUrl
    if (u) return u
  }
  const pub = supabase.storage.from(bucket).getPublicUrl(path)
  const pu = pub?.data?.publicUrl
  if (pu) return pu
  throw new ApiError(500, 'Не удалось получить url для фото')
}

async function hydrateSitePhotos(supabase: any, site: SiteRow): Promise<SiteRow & { photos: SitePhotoOut[] }> {
  const bucket = envBucket()
  const ttl = envTtl()
  const base = normPhotos(site.photos)
  const photos = await Promise.all(
    base.map(async (p) => ({
      path: p.path,
      created_at: p.created_at,
      url: await photoUrl(supabase, bucket, p.path, ttl),
    })),
  )
  return { ...(site as any), photos }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req)

    const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1'

    let q = supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .order('name', { ascending: true })

    if (!includeArchived) q = q.is('archived_at', null)

    const { data, error } = await q
    if (error) throw new ApiError(500, error.message || 'Не удалось загрузить объекты')

    const rows: SiteRow[] = Array.isArray(data) ? (data as any) : []
    const sites = await Promise.all(rows.map((s) => hydrateSitePhotos(supabase, s)))

    return NextResponse.json({ sites }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
