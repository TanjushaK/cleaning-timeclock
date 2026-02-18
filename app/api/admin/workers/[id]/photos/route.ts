import { NextRequest, NextResponse } from 'next/server'

import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }

const BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'

function getSignedTtlSeconds(): number {
  const v = Number(process.env.SITE_PHOTOS_SIGNED_URL_TTL || '86400')
  if (!Number.isFinite(v)) return 86400
  if (v < 60) return 60
  if (v > 60 * 60 * 24 * 7) return 60 * 60 * 24 * 7
  return Math.floor(v)
}

function sanitizeFilenameBase(name: string): string {
  // keep letters/digits/._- ; replace everything else
  const base = name
    .replace(/\.[^/.]+$/, '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
  return base || 'photo'
}

function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return m?.[1] || 'jpg'
}

async function listWorkerPhotos(supabase: any, workerId: string): Promise<WorkerPhoto[]> {
  const prefix = `workers/${workerId}`

  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw new ApiError(500, error.message || 'Не удалось прочитать список фото')

  const items = Array.isArray(data) ? data : []

  const photos: WorkerPhoto[] = items
    .filter((it: any) => it && typeof it.name === 'string' && it.name.length > 0)
    .filter((it: any) => !String(it.name).endsWith('/'))
    .map((it: any) => ({
      path: `${prefix}/${it.name}`,
      created_at: it.created_at || it.updated_at || null,
    }))
    .slice(0, 5)

  if (photos.length === 0) return []

  const ttl = getSignedTtlSeconds()
  const paths = photos.map((p) => p.path)

  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl)
  if (signedError) throw new ApiError(500, signedError.message || 'Не удалось создать ссылки для фото')

  const urlByPath = new Map<string, string>()
  for (const s of signed || []) {
    if (s?.path && s?.signedUrl) urlByPath.set(String(s.path), String(s.signedUrl))
  }

  return photos.map((p) => ({ ...p, url: urlByPath.get(p.path) }))
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) throw new ApiError(400, 'worker id is required')

    const { supabase } = await requireAdmin(_req)
    const photos = await listWorkerPhotos(supabase, id)

    return NextResponse.json({ ok: true, photos })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) throw new ApiError(400, 'worker id is required')

    const { supabase } = await requireAdmin(req)

    // enforce cap (max 5)
    const existing = await listWorkerPhotos(supabase, id)
    if (existing.length >= 5) throw new ApiError(400, 'Лимит 5 фото достигнут')

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) throw new ApiError(400, 'file is required')

    const contentType = (file as any).type || ''
    if (contentType && !String(contentType).startsWith('image/')) {
      throw new ApiError(400, 'Только изображения')
    }

    const ext = getExt((file as any).name || 'photo.jpg')
    const base = sanitizeFilenameBase((file as any).name || 'photo')
    const filename = `${Date.now()}_${Math.random().toString(16).slice(2)}_${base}.${ext}`
    const path = `workers/${id}/${filename}`

    const buf = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: contentType || 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message || 'Не удалось загрузить фото')

    const photos = await listWorkerPhotos(supabase, id)
    return NextResponse.json({ ok: true, photos })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) throw new ApiError(400, 'worker id is required')

    const { supabase } = await requireAdmin(req)

    const body = await req.json().catch(() => ({}))
    const path = String(body?.path || '')

    const expectedPrefix = `workers/${id}/`
    if (!path || !path.startsWith(expectedPrefix)) throw new ApiError(400, 'invalid path')

    const { error: delErr } = await supabase.storage.from(BUCKET).remove([path])
    if (delErr) throw new ApiError(500, delErr.message || 'Не удалось удалить фото')

    const photos = await listWorkerPhotos(supabase, id)
    return NextResponse.json({ ok: true, photos })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
