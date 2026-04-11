import { NextRequest } from 'next/server'

/**
 * Proxy/redirect for legacy relative image URLs like:
 *   /sites/<siteId>/<filename>
 *
 * Redirects to Supabase public storage object:
 *   site-photos/sites/<siteId>/<filename>
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

  const objectPath = ['sites', ...path].join('/')
  const target = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/site-photos/${encodeURI(
    objectPath
  )}`

  return Response.redirect(target, 307)
}
