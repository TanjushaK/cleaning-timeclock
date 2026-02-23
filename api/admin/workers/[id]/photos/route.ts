// app/api/admin/workers/[id]/photos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }
type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path'

const MAX_UPLOAD_BYTES = (() => {
  const raw = process.env.WORKER_PHOTOS_MAX_BYTES || process.env.MAX_UPLOAD_BYTES || '5242880' // 5MB
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return 5 * 1024 * 1024
  return Math.min(Math.max(n, 256 * 1024), 25 * 1024 * 1024)
})()

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

const RAW = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'
const { bucket: BUCKET, prefix: BUCKET_PREFIX } = parseBucketRef(RAW, 'site-photos')

function getSignedTtlSeconds(): number {
  const v = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600')
  if (!Number.isFinite(v) || v <= 0) return 3600
  return Math.min(v, 60 * 60 * 24 * 7)
}

function withCookieBearer(req: NextRequest): Headers {
  const headers = new Headers(req.headers)
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const hasBearer = /^Bearer\s+.+/i.test(auth)
  if (!hasBearer) {
    const cookieToken = req.cookies.get('ct_access_token')?.value?.trim()
    if (cookieToken) headers.set('authorization', `Bearer ${cookieToken}`)
  }
  return headers
}

function safeName(s: string): string {
  return String(s || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
}

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function workerPrefix(workerId: string): string {
  const root = BUCKET_PREFIX ? BUCKET_PREFIX : 'workers'
  return joinPath(root, workerId)
}

function fileExt(file: File) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return ext || 'jpg'
}

function canonicalExt(file: File): string {
  const ext = fileExt(file)
  if (ALLOWED_EXT.has(ext)) return ext
  const mime = String(file.type || '').toLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

function contentTypeFor(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function validateImageFile(file: File) {
  if (!(file instanceof File)) throw new ApiError(400, 'file_required')
  if (file.size <= 0) throw new ApiError(400, 'file_empty')
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, 'file_too_large')

  const ext = fileExt(file)
  const mime = String(file.type || '').toLowerCase()

  const okByMime = mime ? ALLOWED_IMAGE_TYPES.has(mime) : false
  const okByExt = ALLOWED_EXT.has(ext)

  if (!okByMime && !okByExt) throw new ApiError(400, 'file_type_not_allowed')
}

let AVATAR_KEY: AvatarKey | null = null

async function resolveAvatarKey(supabase: any): Promise<AvatarKey> {
  if (AVATAR_KEY) return AVATAR_KEY
  const candidates: AvatarKey[] = ['avatar_path', 'avatar_url', 'photo_path']
  for (const k of candidates) {
    const { error } = await supabase.from('profiles').select(k).limit(1)
    if (!error) {
      AVATAR_KEY = k
      return k
    }
    const msg = String((error as any)?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  AVATAR_KEY = 'avatar_path'
  return AVATAR_KEY
}

async function listPhotos(supabase: any, workerId: string): Promise<WorkerPhoto[]> {
  const pref = workerPrefix(workerId)

  const { data: listed, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list(pref, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

  if (listErr) throw new ApiError(500, listErr.message)

  const itemsRaw = (listed || []).filter((x: any) => x?.name && x.name !== '.emptyFolderPlaceholder')
  const ttl = getSignedTtlSeconds()

  const paths = itemsRaw.map((it: any) => `${pref}/${it.name}`)
  if (paths.length === 0) return []

  const urlByPath = new Map<string, string>()
  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl)

  if (!signErr && Array.isArray(signed)) {
    for (const s of signed as any[]) {
      const p = s?.path ? String(s.path) : ''
      const u = s?.signedUrl ? String(s.signedUrl) : ''
      if (p && u) urlByPath.set(p, u)
    }
  } else {
    for (const p of paths) {
      const { data: one } = await supabase.storage.from(BUCKET).createSignedUrl(p, ttl)
      if (one?.signedUrl) urlByPath.set(p, String(one.signedUrl))
    }
  }

  const out: WorkerPhoto[] = []
  for (const it of itemsRaw) {
    const path = `${pref}/${it.name}`
    out.push({
      path,
      url: urlByPath.get(path),
      created_at: (it as any)?.created_at ?? null,
    })
  }
  return out
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: workerId } = await ctx.params
    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)
    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const photos = await listPhotos((admin as any).supabase, workerId)
    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: workerId } = await ctx.params
    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)
    const sb = (admin as any).supabase

    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const current = await listPhotos(sb, workerId)
    if (current.length >= 5) throw new ApiError(400, 'Лимит: 5 фото. Удали одно и попробуй снова.')

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError(400, 'file_required')

    validateImageFile(file)

    const ext = canonicalExt(file)
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    const filename = `${Date.now()}_${base}.${ext}`

    const pref = workerPrefix(workerId)
    const path = `${pref}/${filename}`

    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = String(file.type || '').toLowerCase()
    const contentType = ALLOWED_IMAGE_TYPES.has(mime) ? String(file.type) : contentTypeFor(ext)

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message)

    const avatarKey = await resolveAvatarKey(sb)
    const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
    const cur = prof ? (prof as any)[avatarKey] : null
    if (!cur) {
      await sb.from('profiles').update({ [avatarKey]: path }).eq('id', workerId)
    }

    const photos = await listPhotos(sb, workerId)
    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: workerId } = await ctx.params
    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)
    const sb = (admin as any).supabase

    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const body = await req.json().catch(() => ({} as any))
    const path = String(body?.path || '').trim()
    if (!path) throw new ApiError(400, 'path_required')

    const pref = workerPrefix(workerId)
    if (!path.startsWith(`${pref}/`)) throw new ApiError(403, 'Нельзя удалять чужие файлы')

    const { error: delErr } = await sb.storage.from(BUCKET).remove([path])
    if (delErr) throw new ApiError(500, delErr.message)

    const photos = await listPhotos(sb, workerId)

    const avatarKey = await resolveAvatarKey(sb)
    const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
    const cur = prof ? (prof as any)[avatarKey] : null
    if (cur && String(cur) === path) {
      const nextAvatar = photos[0]?.path || null
      await sb.from('profiles').update({ [avatarKey]: nextAvatar }).eq('id', workerId)
    }

    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
