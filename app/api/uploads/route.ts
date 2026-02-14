import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, requireUser, supabaseService, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// bucket id не указан в ТЗ → берём из env
const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || ''

function safeExtFromName(name: string) {
  const n = name.toLowerCase()
  const m = /\.([a-z0-9]{1,8})$/.exec(n)
  return m ? m[1] : 'bin'
}

function isImageMime(mime: string) {
  return mime.toLowerCase().startsWith('image/')
}

export async function POST(req: Request) {
  try {
    if (!BUCKET) throw new ApiError(500, 'STORAGE_BUCKET env is missing')

    const form = await req.formData()
    const entity = String(form.get('entity') || '').trim() // 'my_avatar' | 'worker_avatar' | 'site_photo'
    const target_id = String(form.get('target_id') || '').trim() || null
    const file = form.get('file')

    if (!entity) throw new ApiError(400, 'entity_required')
    if (!file || !(file instanceof Blob)) throw new ApiError(400, 'file_required')

    // Важно: Blob.arrayBuffer() — стандартный способ получить бинарные данные. citeturn4search0
    const size = (file as any).size ?? 0
    const type = (file as any).type ?? 'application/octet-stream'
    const name = (file as any).name ?? 'upload.bin'
    if (!isImageMime(type)) throw new ApiError(400, 'only_images_allowed')
    if (size > 6 * 1024 * 1024) throw new ApiError(400, 'file_too_large_max_6mb')

    const supabase = supabaseService()

    // авторизация + определение владельца
    let ownerId: string
    let folder: string

    if (entity === 'my_avatar') {
      const { userId } = await requireUser(req)
      ownerId = userId
      folder = `avatars/${ownerId}`
    } else if (entity === 'worker_avatar') {
      await requireAdmin(req)
      if (!target_id) throw new ApiError(400, 'target_id_required')
      ownerId = target_id
      folder = `avatars/${ownerId}`
    } else if (entity === 'site_photo') {
      await requireAdmin(req)
      if (!target_id) throw new ApiError(400, 'target_id_required')
      ownerId = target_id
      folder = `sites/${ownerId}`
    } else {
      throw new ApiError(400, 'unknown_entity')
    }

    const ext = safeExtFromName(String(name))
    const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const ab = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, ab, {
        contentType: type,
        upsert: false,
      })

    if (upErr) throw new ApiError(400, upErr.message)

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) throw new ApiError(500, 'public_url_not_generated')

    // сохраняем URL в соответствующую таблицу
    if (entity === 'my_avatar' || entity === 'worker_avatar') {
      const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', ownerId)
      if (error) throw new ApiError(400, error.message)
    }
    if (entity === 'site_photo') {
      const { error } = await supabase.from('sites').update({ photo_url: publicUrl }).eq('id', ownerId)
      if (error) throw new ApiError(400, error.message)
    }

    return NextResponse.json({ ok: true, bucket: BUCKET, path: objectPath, publicUrl })
  } catch (e) {
    return toErrorResponse(e)
  }
}
