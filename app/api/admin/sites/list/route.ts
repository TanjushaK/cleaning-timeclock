import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PhotoIn = { path?: string; created_at?: string } | string
type PhotoOut = { path: string; url: string | null; created_at: string | null }

function s(v: any) {
  return String(v ?? '').trim()
}

function getBucket(): string {
  return process.env.SITE_PHOTOS_BUCKET || 'site-photos'
}

function getTtlSeconds(): number {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL || '86400'
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400
}

function normalizePhotos(raw: any): { path: string; created_at: string | null }[] {
  if (!Array.isArray(raw)) return []
  const out: { path: string; created_at: string | null }[] = []

  for (const p of raw as PhotoIn[]) {
    if (typeof p === 'string') {
      const path = p.trim()
      if (path) out.push({ path, created_at: null })
      continue
    }
    const path = s((p as any)?.path)
    if (!path) continue
    const created_at = s((p as any)?.created_at) || null
    out.push({ path, created_at })
  }

  return out
}

async function photoUrl(supabase: any, path: string): Promise<string | null> {
  const bucket = getBucket()
  const ttl = getTtlSeconds()

  const signed = await supabase.storage.from(bucket).createSignedUrl(path, ttl)
  const signedUrl = signed?.data?.signedUrl
  if (signedUrl) return signedUrl

  const pub = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = pub?.data?.publicUrl
  if (publicUrl) return publicUrl

  return null
}

async function signPhotos(supabase: any, raw: any): Promise<PhotoOut[]> {
  const base = normalizePhotos(raw)
  const out = await Promise.all(
    base.map(async (p) => ({
      path: p.path,
      created_at: p.created_at,
      url: await photoUrl(supabase, p.path),
    })),
  )
  return out
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

    const rows = Array.isArray(data) ? (data as any[]) : []
    const sites = await Promise.all(
      rows.map(async (site) => {
        const photos = await signPhotos(supabase, site?.photos)
        return { ...site, photos }
      }),
    )

    return NextResponse.json({ sites }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
