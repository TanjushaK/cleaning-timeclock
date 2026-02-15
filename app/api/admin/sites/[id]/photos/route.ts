<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const BUCKET = 'site-photos'

type SitePhoto = { path: string; url: string; created_at?: string }

function safeStr(v: any) {
  return String(v ?? '').trim()
}

function sanitizeFilename(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\.\-_]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'photo'
}

function rand() {
  return Math.random().toString(36).slice(2, 10)
}

async function loadSitePhotos(supabase: any, siteId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabase.from('sites').select('photos').eq('id', siteId).single()
  if (error) throw new ApiError(404, 'Объект не найден')
  const raw = (data as any)?.photos
  return Array.isArray(raw) ? (raw as SitePhoto[]) : []
}

async function savePhotos(supabase: any, siteId: string, photos: SitePhoto[]) {
  const { data, error } = await supabase
    .from('sites')
    .update({ photos })
    .eq('id', siteId)
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .single()

  if (error) throw new ApiError(500, error.message || 'Не удалось сохранить фото')
  return data
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const fd = await req.formData()
    const file = fd.get('file')

    if (!file || !(file instanceof File)) throw new ApiError(400, 'Нужен файл (file)')
    if (!file.type?.startsWith('image/')) throw new ApiError(400, 'Нужна картинка (image/*)')

    const photos = await loadSitePhotos(supabase, siteId)
    if (photos.length >= 5) throw new ApiError(400, 'Максимум 5 фото')

    const filename = sanitizeFilename(safeStr(file.name))
    const path = `site-${siteId}/${Date.now()}-${rand()}-${filename}`

    const ab = await file.arrayBuffer()
    const bytes = new Uint8Array(ab)

    const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) throw new ApiError(500, up.error.message || 'Не удалось загрузить фото')

    const pub = supabase.storage.from(BUCKET).getPublicUrl(path)
    const url = pub?.data?.publicUrl
    if (!url) throw new ApiError(500, 'Не удалось получить public url')

    const nextPhotos: SitePhoto[] = [
      ...photos,
      { path, url, created_at: new Date().toISOString() },
    ]

    const site = await savePhotos(supabase, siteId, nextPhotos)
    return NextResponse.json({ site }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const body = await req.json().catch(() => ({}))
    const action = safeStr(body?.action)

    if (action !== 'make_primary') throw new ApiError(400, 'Неверное action (нужно make_primary)')

    const path = safeStr(body?.path)
    if (!path) throw new ApiError(400, 'Нужен path')

    const photos = await loadSitePhotos(supabase, siteId)
    const idx = photos.findIndex((p) => p?.path === path)
    if (idx < 0) throw new ApiError(404, 'Фото не найдено')
    if (idx === 0) {
      const site = await savePhotos(supabase, siteId, photos)
      return NextResponse.json({ site }, { status: 200 })
    }

    const picked = photos[idx]
    const rest = photos.filter((p) => p?.path !== path)
    const nextPhotos: SitePhoto[] = [picked, ...rest]

    const site = await savePhotos(supabase, siteId, nextPhotos)
    return NextResponse.json({ site }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const body = await req.json().catch(() => ({}))
    const path = safeStr(body?.path)
    if (!path) throw new ApiError(400, 'Нужен path')

    const photos = await loadSitePhotos(supabase, siteId)
    const nextPhotos = photos.filter((p) => p?.path !== path)

    await supabase.storage.from(BUCKET).remove([path]).catch(() => null)

    const site = await savePhotos(supabase, siteId, nextPhotos)
    return NextResponse.json({ site }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
=======
// app/api/admin/sites/[id]/photos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

type SitePhoto = {
  path: string
  url: string
  created_at?: string
}

const BUCKET = process.env.SUPABASE_SITE_PHOTOS_BUCKET || 'site-photos'
const MAX_PHOTOS = 5

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function safeExt(name: string) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '')
  const ext = m?.[1]?.toLowerCase() || 'jpg'
  return ext.slice(0, 8)
}

function moveToFront(arr: SitePhoto[], path: string) {
  const idx = arr.findIndex((x) => x.path === path)
  if (idx <= 0) return arr
  const copy = arr.slice()
  const [it] = copy.splice(idx, 1)
  copy.unshift(it)
  return copy
}

async function loadSitePhotos(siteId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabaseAdmin.from('sites').select('photos').eq('id', siteId).maybeSingle()
  if (error) throw new Error(error.message)
  const photos = (data as any)?.photos
  return Array.isArray(photos) ? (photos as SitePhoto[]) : []
}

async function saveSitePhotos(siteId: string, photos: SitePhoto[]) {
  const { data, error } = await supabaseAdmin.from('sites').update({ photos }).eq('id', siteId).select('id, photos').single()
  if (error) throw new Error(error.message)
  return data as any
}

async function publicUrl(path: string) {
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)

    const { id: siteId } = await ctx.params
    if (!siteId) return jsonError('Нет site id', 400)

    const current = await loadSitePhotos(siteId)
    if (current.length >= MAX_PHOTOS) return jsonError(`Лимит фото: ${MAX_PHOTOS}`, 400)

    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) return jsonError('Ожидается файл в поле "file"', 400)
    if (!file.size) return jsonError('Пустой файл', 400)

    const ext = safeExt(file.name)
    const ts = Date.now()
    const path = `sites/${siteId}/${ts}.${ext}`

    const buf = Buffer.from(await file.arrayBuffer())

    const up = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

    if (up.error) return jsonError(up.error.message || 'Не удалось загрузить файл', 500)

    const url = (await publicUrl(path)) || ''

    const next: SitePhoto[] = [
      ...current,
      { path, url, created_at: new Date().toISOString() },
    ].slice(0, MAX_PHOTOS)

    const saved = await saveSitePhotos(siteId, next)
    return NextResponse.json({ site: saved })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка загрузки', 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)

    const { id: siteId } = await ctx.params
    if (!siteId) return jsonError('Нет site id', 400)

    const body = await req.json().catch(() => null)
    const path = String(body?.path || '')
    if (!path) return jsonError('Нет path', 400)

    // storage delete (не критично для UX: если файла нет — всё равно чистим список)
    await supabaseAdmin.storage.from(BUCKET).remove([path])

    const current = await loadSitePhotos(siteId)
    const next = current.filter((p) => p.path !== path)

    const saved = await saveSitePhotos(siteId, next)
    return NextResponse.json({ site: saved })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка удаления', 500)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin(req)

    const { id: siteId } = await ctx.params
    if (!siteId) return jsonError('Нет site id', 400)

    const body = await req.json().catch(() => null)
    const action = String(body?.action || '')
    const path = String(body?.path || '')

    if (action !== 'make_primary') return jsonError('Неизвестное действие', 400)
    if (!path) return jsonError('Нет path', 400)

    const current = await loadSitePhotos(siteId)
    const next = moveToFront(current, path)

    const saved = await saveSitePhotos(siteId, next)
    return NextResponse.json({ site: saved })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка обновления', 500)
>>>>>>> 8350926 (fix build (cookies async) + supabase-route)
  }
}
