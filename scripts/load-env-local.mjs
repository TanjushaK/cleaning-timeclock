import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

/** Local dev secrets: `.env.local` overrides process for these keys (fixes wrong inherited env in agent/CI shells). */
const PREFER_FILE_FOR = new Set([
  'DATABASE_URL',
  'POSTGRES_ADMIN_PASSWORD',
  'POSTGRES_ADMIN_PASSWORD_FILE',
  'POSTGRES_ADMIN_URL',
  'POSTGRES_ADMIN_USER',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
])

function setFromFile(key, val) {
  if (!val) return
  if (PREFER_FILE_FOR.has(key)) {
    process.env[key] = val
    return
  }
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = val
  }
}

/**
 * Loads `.env.local` then `.env`. For keys in {@link PREFER_FILE_FOR}, file wins over process when set.
 */
export function loadEnvLocal() {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(root, name)
    if (!fs.existsSync(filePath)) continue
    const text = fs.readFileSync(filePath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      setFromFile(key, val)
    }
  }
}
