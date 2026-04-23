import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'pg'
import { loadEnvLocal } from './load-env-local.mjs'

loadEnvLocal()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

const migDir = path.join(root, 'db', 'migrations')
if (!fs.existsSync(migDir)) {
  throw new Error(`Migrations directory not found: ${migDir}`)
}

const files = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

if (!files.length) {
  throw new Error(`No .sql files in ${migDir}`)
}

const connectionString = required('DATABASE_URL')

const client = new Client({ connectionString })
await client.connect()
try {
  for (const f of files) {
    const sqlPath = path.join(migDir, f)
    const sql = fs.readFileSync(sqlPath, 'utf8')
    await client.query(sql)
    console.log(JSON.stringify({ ok: true, migration: path.relative(root, sqlPath) }))
  }
} finally {
  await client.end()
}
