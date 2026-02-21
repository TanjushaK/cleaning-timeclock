import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

// Можно задать как "site-photos" или "site-photos/workers" — код сам разрулит bucket/prefix.
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
  return s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
}

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function workerPrefix(workerId: string): string {
  // Если prefix задан (например "workers") — используем его как root.
  // Если prefix пуст — root = "workers".
  const root = BUCKET_PREFIX ? BUCKET_PREFIX : 'workers'
  return joinPath(root, workerId)
}

let AVATAR_KEY: 'avatar_path' | 'avatar_url' | 'photo_path' | null = null

async function resolveAvatarKey(supabase: any) {
  if (AVATAR_KEY) return AVATAR_KEY
  const candidates: Array<'avatar_path' | 'avatar_url' | 'photo_path'> = ['avatar_path', 'avatar_url', 'photo_path']
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

  // bulk signed urls
  const urlByPath = new Map<string, string>()
  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl)

  if (!signErr && Array.isArray(signed)) {
    for (const s of signed as any[]) {
      const p = s?.path ? String(s.path) : ''
      const u = s?.signedUrl ? String(s.signedUrl) : ''
      if (p && u) urlByPath.set(p, u)
    }
  } else {
    // fallback per-item
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
    if (!(file instanceof File)) throw new ApiError(400, 'Нет файла (formData file)')
    if (file.size <= 0) throw new ApiError(400, 'Файл пустой')

    const maxBytes = Number(process.env.WORKER_PHOTOS_MAX_BYTES || String(8 * 1024 * 1024))
    if (Number.isFinite(maxBytes) && file.size > maxBytes) throw new ApiError(413, `Файл слишком большой (> ${maxBytes} bytes)`)

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    const filename = `${Date.now()}_${base}.${ext}`

    const pref = workerPrefix(workerId)
    const path = `${pref}/${filename}`

    const buf = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message)

    // если аватар не выбран — назначим первый загруженный автоматически
    const avatarKey = await resolveAvatarKey(sb)
    if (avatarKey) {
      const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
      const cur = prof ? (prof as any)[avatarKey] : null
      if (!cur) {
        await sb.from('profiles').update({ [avatarKey]: path }).eq('id', workerId)
      }
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

    // если удалили текущий аватар — перекинем на первый оставшийся (или null)
    const avatarKey = await resolveAvatarKey(sb)
    if (avatarKey) {
      const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
      const cur = prof ? (prof as any)[avatarKey] : null
      if (cur && String(cur) === path) {
        const nextAvatar = photos[0]?.path || null
        await sb.from('profiles').update({ [avatarKey]: nextAvatar }).eq('id', workerId)
      }
    }

    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
