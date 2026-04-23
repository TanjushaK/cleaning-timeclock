import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import mime from 'mime-types'
import { verifyStorageToken } from '@/lib/server/storage/signing'
import { resolveStoragePath } from '@/lib/server/storage/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get('token') || '').trim()
  if (!token) return new Response('Missing token', { status: 400 })

  try {
    const payload = await verifyStorageToken(token)
    const filePath = resolveStoragePath(payload.bucket, payload.path)
    const content = await fs.readFile(filePath)
    const contentType = mime.lookup(filePath) || 'application/octet-stream'
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': String(contentType),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Invalid token', { status: 401 })
  }
}
