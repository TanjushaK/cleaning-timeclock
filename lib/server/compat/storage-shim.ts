import path from 'path'
import { promises as fs } from 'fs'
import mime from 'mime-types'
import { appOrigin } from '@/lib/server/env'
import { ensureParentDir, resolveStoragePath, safeRelativePath } from '@/lib/server/storage/paths'
import { createSignedStorageUrl } from '@/lib/server/storage/signing'
import type { CompatResponse, StorageListItem, StorageSignedUrl } from '@/lib/server/compat/types'

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function fileExistsInBucket(bucket: string, objectPath: string): Promise<boolean> {
  try {
    const absolute = resolveStoragePath(bucket, safeRelativePath(objectPath))
    return await pathExists(absolute)
  } catch {
    return false
  }
}

async function listDirectory(root: string): Promise<StorageListItem[]> {
  if (!(await pathExists(root))) return []
  const entries = await fs.readdir(root, { withFileTypes: true })
  const rows: StorageListItem[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const absolute = path.join(root, entry.name)
    const stat = await fs.stat(absolute)
    rows.push({
      name: entry.name,
      created_at: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
    })
  }
  return rows
}

function publicUrl(bucket: string, objectPath: string): string {
  return `${appOrigin()}/api/storage/public/${encodeURIComponent(bucket)}/${objectPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`
}

/** Filesystem-backed bucket API compatible with the storage surface expected by route handlers. */
export class StorageBucketClient {
  constructor(private readonly bucket: string) {}

  async list(prefix: string, options?: { limit?: number; sortBy?: { column: string; order: 'asc' | 'desc' } }): Promise<CompatResponse<StorageListItem[]>> {
    try {
      const safePrefix = safeRelativePath(prefix)
      const absolute = resolveStoragePath(this.bucket, safePrefix)
      let items = await listDirectory(absolute)
      const order = options?.sortBy?.order || 'asc'
      items.sort((a, b) => {
        const av = a.created_at || ''
        const bv = b.created_at || ''
        return order === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv)
      })
      if (options?.limit) items = items.slice(0, options.limit)
      return { data: items, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'Storage list failed' } }
    }
  }

  async upload(objectPath: string, input: Buffer | Uint8Array, _options?: { contentType?: string; upsert?: boolean }): Promise<CompatResponse<null>> {
    try {
      const safeObjectPath = safeRelativePath(objectPath)
      const absolute = resolveStoragePath(this.bucket, safeObjectPath)
      if (_options?.upsert === false && (await pathExists(absolute))) {
        return { data: null, error: { message: 'The resource already exists' } }
      }
      await ensureParentDir(absolute)
      await fs.writeFile(absolute, Buffer.from(input))
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'Storage upload failed' } }
    }
  }

  async remove(paths: string[]): Promise<CompatResponse<null>> {
    try {
      for (const item of paths) {
        const absolute = resolveStoragePath(this.bucket, safeRelativePath(item))
        await fs.rm(absolute, { force: true })
      }
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'Storage remove failed' } }
    }
  }

  async download(objectPath: string): Promise<CompatResponse<Blob>> {
    try {
      const absolute = resolveStoragePath(this.bucket, safeRelativePath(objectPath))
      const content = await fs.readFile(absolute)
      const contentType = mime.lookup(absolute) || 'application/octet-stream'
      return { data: new Blob([content], { type: contentType }), error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'Storage download failed' } }
    }
  }

  async createSignedUrl(objectPath: string, ttlSeconds: number): Promise<CompatResponse<{ signedUrl: string; path: string }>> {
    try {
      const safeObjectPath = safeRelativePath(objectPath)
      if (!(await fileExistsInBucket(this.bucket, safeObjectPath))) {
        return { data: null, error: { message: 'Storage object not found' } }
      }
      const signedUrl = await createSignedStorageUrl(this.bucket, safeObjectPath, ttlSeconds)
      return { data: { signedUrl, path: safeObjectPath }, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'Signed URL failed' } }
    }
  }

  async createSignedUrls(paths: string[], ttlSeconds: number): Promise<CompatResponse<StorageSignedUrl[]>> {
    try {
      const data: StorageSignedUrl[] = []
      for (const item of paths) {
        const safeObjectPath = safeRelativePath(item)
        if (!(await fileExistsInBucket(this.bucket, safeObjectPath))) continue
        data.push({
          path: safeObjectPath,
          signedUrl: await createSignedStorageUrl(this.bucket, safeObjectPath, ttlSeconds),
        })
      }
      return { data, error: null }
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'Signed URLs failed' } }
    }
  }

  getPublicUrl(objectPath: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: publicUrl(this.bucket, safeRelativePath(objectPath)) } }
  }
}

export class StorageShim {
  from(bucket: string): StorageBucketClient {
    return new StorageBucketClient(bucket)
  }
}
