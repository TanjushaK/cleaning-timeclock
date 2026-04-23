import { promises as fs } from 'fs'
import mime from 'mime-types'
import { resolveStoragePath } from '@/lib/server/storage/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const params = await ctx.params
  if (!params.bucket || !Array.isArray(params.path) || params.path.length === 0) {
    return new Response('Missing path', { status: 400 })
  }

  try {
    const filePath = resolveStoragePath(params.bucket, params.path.join('/'))
    const content = await fs.readFile(filePath)
    const contentType = mime.lookup(filePath) || 'application/octet-stream'
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': String(contentType),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
