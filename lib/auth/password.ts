import crypto from 'crypto'

const KEY_LEN = 64

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64url')
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, (error, derivedKey) => {
      if (error) return reject(error)
      resolve(derivedKey as Buffer)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await scryptAsync(password, salt)
  return `scrypt$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

export async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash) return false
  const parts = String(storedHash).split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = fromBase64Url(parts[1])
  const expected = fromBase64Url(parts[2])
  const actual = await scryptAsync(password, salt)
  return crypto.timingSafeEqual(actual, expected)
}
