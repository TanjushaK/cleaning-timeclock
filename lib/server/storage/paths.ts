import path from 'path'
import { promises as fs } from 'fs'
import { uploadRoot } from '@/lib/server/env'

function cleanSegment(value: string): string {
  return value.replace(/^\/+|\/+$/g, '').replace(/\\+/g, '/').trim()
}

export function safeRelativePath(value: string): string {
  const normalized = cleanSegment(value)
  if (!normalized) throw new Error('Empty storage path')
  const segments = normalized.split('/').filter(Boolean)
  for (const segment of segments) {
    if (segment === '.' || segment === '..') throw new Error('Invalid storage path')
  }
  return segments.join('/')
}

export function resolveStoragePath(bucket: string, objectPath: string): string {
  const safeBucket = safeRelativePath(bucket)
  const safeObjectPath = safeRelativePath(objectPath)
  return path.join(uploadRoot(), safeBucket, safeObjectPath)
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}
