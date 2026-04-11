import { NextRequest } from 'next/server'

/**
 * Safety net: some UI paths previously tried to load "/undefined/<...>" due to a missing prefix.
 * We map it to "sites/<...>" in Supabase to avoid broken images in reports.
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
