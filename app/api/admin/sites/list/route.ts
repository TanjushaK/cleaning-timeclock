// app/api/admin/sites/list/route.ts
import { NextResponse } from 'next/server'
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
    out.push({ ...p, url: data?.signedUrl || p.url || '' })
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sites = (data as SiteRow[]).map((s) => ({ ...s }))
  for (const s of sites) {
    s.photos = await signPhotos(s.photos)
  }

  return NextResponse.json({ sites }, { status: 200 })
}
