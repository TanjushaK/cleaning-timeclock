import { NextRequest } from 'next/server'
import { assertSafePublicStorageSegments } from '@/lib/storage-redirect-path'

/**
 * Proxy/redirect for legacy relative image URLs like:
 *   /workers/<workerId>/<filename>
 *
 * We keep the UI simple: anywhere in the app can point <img src="/workers/...">
 * and this route will redirect to Supabase public storage object:
 *   site-photos/workers/<workerId>/<filename>
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

  if (!supabaseUrl) {
    return new Response('Missing NEXT_PUBLIC_SUPABASE_URL', { status: 500 })
  }

  if (!path || path.length === 0) {
    return new Response('Missing path', { status: 400 })
  }

  const bad = assertSafePublicStorageSegments(path)
  if (bad) return bad

  const objectPath = ['workers', ...path].join('/')
  const target = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/site-photos/${encodeURI(
    objectPath
  )}`

  // 307 so browsers keep method if ever used differently; for images it's GET anyway.
  return Response.redirect(target, 307)
}
