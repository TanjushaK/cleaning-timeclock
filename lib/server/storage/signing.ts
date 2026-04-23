import { SignJWT, jwtVerify } from 'jose'
import { appOrigin, storageSigningSecret } from '@/lib/server/env'

const encoder = new TextEncoder()

function key() {
  return encoder.encode(storageSigningSecret())
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
  const { payload } = await jwtVerify(token, key())
  return {
    bucket: String(payload.bucket || ''),
    path: String(payload.path || ''),
  }
}
