import { SignJWT, jwtVerify } from 'jose'
import { appOrigin, storageSigningSecret } from '@/lib/server/env'

const encoder = new TextEncoder()

function key() {
  return encoder.encode(storageSigningSecret())
}

export type StorageTokenErrorCode = 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_PATH_INVALID'

export class StorageTokenError extends Error {
  code: StorageTokenErrorCode

  constructor(code: StorageTokenErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'StorageTokenError'
  }
}

export async function createStorageToken(bucket: string, objectPath: string, ttlSeconds: number): Promise<string> {
  return await new SignJWT({ bucket, path: objectPath })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key())
}

export async function createSignedStorageUrl(bucket: string, objectPath: string, ttlSeconds: number): Promise<string> {
  const token = await createStorageToken(bucket, objectPath, ttlSeconds)
  return `${appOrigin()}/api/storage/file?token=${encodeURIComponent(token)}`
}

export async function verifyStorageToken(token: string): Promise<{ bucket: string; path: string }> {
  try {
    const { payload } = await jwtVerify(token, key())
    const bucket = String(payload.bucket || '').trim()
    const objectPath = String(payload.path || '').trim()
    if (!bucket || !objectPath) {
      throw new StorageTokenError('TOKEN_PATH_INVALID', 'Invalid storage token payload')
    }
    return { bucket, path: objectPath }
  } catch (error) {
    if (error instanceof StorageTokenError) throw error
    const code = String((error as { code?: string })?.code || '')
    const name = String((error as { name?: string })?.name || '')
    if (code === 'ERR_JWT_EXPIRED' || name === 'JWTExpired') {
      throw new StorageTokenError('TOKEN_EXPIRED', 'Expired storage token')
    }
    throw new StorageTokenError('TOKEN_INVALID', 'Invalid storage token')
  }
}
