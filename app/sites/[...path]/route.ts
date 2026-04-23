import { NextRequest } from 'next/server'
import { appOrigin } from '@/lib/server/env'
import { assertSafePublicStorageSegments } from '@/lib/storage-redirect-path'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  if (!path || path.length === 0) return new Response('Missing path', { status: 400 })
  const bad = assertSafePublicStorageSegments(path)
  if (bad) return bad
  const target = `${appOrigin()}/api/storage/public/site-photos/${['sites', ...path].map(encodeURIComponent).join('/')}`
  return Response.redirect(target, 307)
}
