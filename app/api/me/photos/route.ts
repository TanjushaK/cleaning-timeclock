// app/api/me/photos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Photo = { path: string; url?: string; created_at?: string | null }
type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path'

const MAX_UPLOAD_BYTES = (() => {
  const raw = process.env.WORKER_PHOTOS_MAX_BYTES || process.env.MAX_UPLOAD_BYTES || '5242880' // 5MB
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return 5 * 1024 * 1024
  return Math.min(Math.max(n, 256 * 1024), 25 * 1024 * 1024) // clamp 256KB..25MB
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

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function safeName(s: string) {
  return String(s || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
}

function getTtl() {
  const v = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600')
  return Number.isFinite(v) && v > 0 ? Math.min(v, 60 * 60 * 24 * 7) : 3600
}

function pref(userId: string) {
  const root = BUCKET_PREFIX ? BUCKET_PREFIX : 'workers'
  return joinPath(root, userId)
}

function fileExt(file: File) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return ext || 'jpg'
}

function validateImageFile(file: File) {
  if (!(file instanceof File)) throw new ApiError(400, 'File is required', AppApiErrorCodes.PHOTOS_FILE_REQUIRED)
  if (file.size <= 0) throw new ApiError(400, 'File is empty', AppApiErrorCodes.PHOTOS_FILE_EMPTY)
  if (file.size > MAX_UPLOAD_BYTES)
    throw new ApiError(400, 'File is too large', AppApiErrorCodes.PHOTOS_FILE_TOO_LARGE)

  const ext = fileExt(file)
  const mime = String(file.type || '').toLowerCase()

  const okByMime = mime ? ALLOWED_IMAGE_TYPES.has(mime) : false
  const okByExt = ALLOWED_EXT.has(ext)

  if (!okByMime && !okByExt)
    throw new ApiError(400, 'File type not allowed', AppApiErrorCodes.PHOTOS_FILE_TYPE_NOT_ALLOWED)
}

async function resolveAvatarKey(sb: any): Promise<AvatarKey> {
  const candidates: AvatarKey[] = ['avatar_path', 'avatar_url', 'photo_path']
  for (const k of candidates) {
    const { error } = await sb.from('profiles').select(k).limit(1)
    if (!error) return k
    const msg = String(error?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  return 'avatar_path'
}

async function listPhotos(sb: any, userId: string): Promise<Photo[]> {
  const p = pref(userId)

  const { data, error } = await sb.storage.from(BUCKET).list(p, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw new ApiError(500, error.message, AppApiErrorCodes.PHOTOS_LIST_FAILED)

  const items = (data || []).filter((x: any) => x?.name && x.name !== '.emptyFolderPlaceholder')
  const paths = items.map((it: any) => `${p}/${it.name}`)
  if (paths.length === 0) return []

  const ttl = getTtl()
  const urlByPath = new Map<string, string>()
  const { data: signed, error: signErr } = await sb.storage.from(BUCKET).createSignedUrls(paths, ttl)
  if (!signErr && Array.isArray(signed)) {
    for (const s of signed as any[]) {
      const pp = s?.path ? String(s.path) : ''
      const uu = s?.signedUrl ? String(s.signedUrl) : ''
      if (pp && uu) urlByPath.set(pp, uu)
    }
  }

  return items.map((it: any) => {
    const path = `${p}/${it.name}`
    return { path, url: urlByPath.get(path), created_at: (it as any)?.created_at ?? null }
  })
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, userId } = await requireUser(req)

    const photos = await listPhotos(supabase, userId)

    const avatarKey = await resolveAvatarKey(supabase)
    const { data: prof } = await supabase.from('profiles').select(avatarKey).eq('id', userId).maybeSingle()
    const avatar_path = prof ? String((prof as any)[avatarKey] || '') : ''

    return NextResponse.json({ photos, avatar_path: avatar_path || null })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, userId } = await requireUser(req)

    const current = await listPhotos(supabase, userId)
    if (current.length >= 5)
      throw new ApiError(
        400,
        'Photo limit is 5; delete one and try again.',
        AppApiErrorCodes.PHOTOS_LIMIT_REACHED,
      )

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError(400, 'File is required', AppApiErrorCodes.PHOTOS_FILE_REQUIRED)

    validateImageFile(file)

    const ext = fileExt(file)
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    const filename = `${Date.now()}_${base}.${ext}`

    const path = `${pref(userId)}/${filename}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const contentType = ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())
      ? String(file.type)
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg'

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message, AppApiErrorCodes.PHOTOS_UPLOAD_FAILED)

    const avatarKey = await resolveAvatarKey(supabase)
    const { data: prof } = await supabase.from('profiles').select(avatarKey).eq('id', userId).maybeSingle()
    const cur = prof ? (prof as any)[avatarKey] : null
    if (!cur) {
      await supabase.from('profiles').update({ [avatarKey]: path }).eq('id', userId)
    }

    const photos = await listPhotos(supabase, userId)
    const { data: prof2 } = await supabase.from('profiles').select(avatarKey).eq('id', userId).maybeSingle()
    const avatar_path = prof2 ? String((prof2 as any)[avatarKey] || '') : ''

    return NextResponse.json({ photos, avatar_path: avatar_path || null })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as any))

    const action = String(body?.action || '')
    const path = String(body?.path || '').trim()
    if (action !== 'make_primary')
      throw new ApiError(400, 'Invalid action', AppApiErrorCodes.PHOTOS_INVALID_ACTION)
    if (!path) throw new ApiError(400, 'Path is required', AppApiErrorCodes.PHOTOS_PATH_REQUIRED)
    if (!path.startsWith(`${pref(userId)}/`))
      throw new ApiError(403, 'Forbidden', AppApiErrorCodes.PHOTOS_FORBIDDEN)

    const avatarKey = await resolveAvatarKey(supabase)
    const r = await supabase.from('profiles').update({ [avatarKey]: path }).eq('id', userId)
    if (r.error) throw new ApiError(400, r.error.message, AppApiErrorCodes.PHOTOS_UPDATE_FAILED)

    const photos = await listPhotos(supabase, userId)
    return NextResponse.json({ photos, avatar_path: path })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as any))
    const path = String(body?.path || '').trim()
    if (!path) throw new ApiError(400, 'Path is required', AppApiErrorCodes.PHOTOS_PATH_REQUIRED)

    const p = pref(userId)
    if (!path.startsWith(`${p}/`)) throw new ApiError(403, 'Forbidden', AppApiErrorCodes.PHOTOS_FORBIDDEN)

    const { error: delErr } = await supabase.storage.from(BUCKET).remove([path])
    if (delErr) throw new ApiError(500, delErr.message, AppApiErrorCodes.PHOTOS_DELETE_FAILED)

    const avatarKey = await resolveAvatarKey(supabase)
    const { data: prof } = await supabase.from('profiles').select(avatarKey).eq('id', userId).maybeSingle()
    const cur = prof ? (prof as any)[avatarKey] : null

    const photos = await listPhotos(supabase, userId)

    if (cur && String(cur) === path) {
      const nextAvatar = photos[0]?.path || null
      await supabase.from('profiles').update({ [avatarKey]: nextAvatar }).eq('id', userId)
      return NextResponse.json({ photos, avatar_path: nextAvatar })
    }

    const avatar_path = cur ? String(cur) : ''
    return NextResponse.json({ photos, avatar_path: avatar_path || null })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    },
  })
}
