import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-server'

export const runtime = 'nodejs'

function guessContentType(path: string): string {
  const p = path.toLowerCase()
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.gif')) return 'image/gif'
  if (p.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

async function tryDownload(bucket: string, objectPath: string) {
  const sb = supabaseService()
  const { data, error } = await sb.storage.from(bucket).download(objectPath)
  return { data, error }
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path } = await ctx.params
    const parts = Array.isArray(path) ? path : []
    const objectPath = parts.map((p) => decodeURIComponent(p)).join('/')

    if (!objectPath) {
      return NextResponse.json({ error: 'Missing path.' }, { status: 400 })
    }

    // bucket name: env override, otherwise 'workers'
    const bucket = process.env.NEXT_PUBLIC_WORKERS_BUCKET || process.env.WORKERS_BUCKET || 'workers'

    // Try exact path first
    let { data, error } = await tryDownload(bucket, objectPath)

    // Fallback: some code may store keys with an extra 'workers/' prefix
    if (error && !objectPath.startsWith('workers/')) {
      ;({ data, error } = await tryDownload(bucket, `workers/${objectPath}`))
    }

    if (error || !data) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    const buf = Buffer.from(await data.arrayBuffer())

    // Best effort content-type
    const contentType = (data as any)?.type || guessContentType(objectPath)

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // cache aggressively; object names are unique (timestamp/hash)
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy error.' }, { status: 500 })
  }
}
