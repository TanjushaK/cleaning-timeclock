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

const sqlPath = path.join(root, 'db', 'migrations', '001_init.sql')
if (!fs.existsSync(sqlPath)) {
  throw new Error(`Migration file not found: ${sqlPath}`)
}

const connectionString = required('DATABASE_URL')
const sql = fs.readFileSync(sqlPath, 'utf8')

const client = new Client({ connectionString })
await client.connect()
try {
  await client.query(sql)
  console.log(JSON.stringify({ ok: true, migration: path.relative(root, sqlPath) }))
} finally {
  await client.end()
}
