import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import mime from 'mime-types'
import { StorageTokenError, verifyStorageToken } from '@/lib/server/storage/signing'
import { resolveStoragePath } from '@/lib/server/storage/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get('token') || '').trim()
  if (!token) return new Response('Missing token', { status: 400 })

  try {
    const payload = await verifyStorageToken(token)
    let filePath: string
    try {
      filePath = resolveStoragePath(payload.bucket, payload.path)
    } catch {
      return new Response('Invalid storage path', { status: 400 })
    }

    let content: Buffer
    try {
      content = await fs.readFile(filePath)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        const code = String((error as { code?: string }).code || '')
        if (code === 'ENOENT') {
          return new Response('File not found', { status: 404 })
        }
        if (code === 'EACCES' || code === 'EPERM') {
          return new Response('Forbidden', { status: 403 })
        }
      }
      return new Response('Storage read failed', { status: 500 })
    }
    const contentType = mime.lookup(filePath) || 'application/octet-stream'
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': String(contentType),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    if (error instanceof StorageTokenError) {
      if (error.code === 'TOKEN_INVALID' || error.code === 'TOKEN_EXPIRED') {
        return new Response('Invalid token', { status: 401 })
      }
      if (error.code === 'TOKEN_PATH_INVALID') {
        return new Response('Invalid storage path', { status: 400 })
      }
    }
    return new Response('Internal server error', { status: 500 })
  }
}
