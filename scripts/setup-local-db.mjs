/**
 * Ensures app role + database exist (via superuser URL), then applies 001_init.sql.
 *
 * Required:
 *   DATABASE_URL — target app connection string (user/db to create/use)
 *
 * One of:
 *   POSTGRES_ADMIN_URL — full URL, e.g. postgres://postgres:secret@127.0.0.1:5432/postgres
 *   POSTGRES_ADMIN_PASSWORD — password for local user "postgres" on 127.0.0.1:5432 (Windows-friendly)
 */
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

function quoteIdent(s) {
  return `"${String(s).replace(/"/g, '""')}"`
}

function quoteLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

function parseDbUrl(urlString) {
  const u = new URL(urlString)
  const user = decodeURIComponent(u.username || '')
  const pass = u.password !== '' ? decodeURIComponent(u.password) : ''
  const db = (u.pathname || '/').replace(/^\//, '') || 'postgres'
  const host = u.hostname || '127.0.0.1'
  const port = u.port ? Number(u.port) : 5432
  return { user, pass, db, host, port }
}

function adminConnectionString() {
  const full = String(process.env.POSTGRES_ADMIN_URL ?? '').trim()
  if (full) return full
  const pass = String(process.env.POSTGRES_ADMIN_PASSWORD ?? '').trim()
  if (!pass) return null
  const { host, port } = parseDbUrl(required('DATABASE_URL'))
  const enc = encodeURIComponent(pass)
  return `postgres://postgres:${enc}@${host}:${port}/postgres`
}

const dbUrl = required('DATABASE_URL')
const target = parseDbUrl(dbUrl)

const adminUrl = adminConnectionString()
if (!adminUrl) {
  console.error(
    'Set POSTGRES_ADMIN_URL or POSTGRES_ADMIN_PASSWORD to create the app role/database, then re-run.',
  )
  process.exit(1)
}

const admin = new Client({ connectionString: adminUrl })
try {
  await admin.connect()
} catch (e) {
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
  if (code === '28P01') {
    console.error(
      [
        'PostgreSQL rejected the admin password (28P01).',
        'Set POSTGRES_ADMIN_PASSWORD to the password for OS user "postgres", or set POSTGRES_ADMIN_URL',
        '(full connection URL to a superuser DB, usually …/postgres).',
        'Then run: npm run db:setup',
      ].join('\n'),
    )
  }
  throw e
}
try {
  const userRes = await admin.query('select 1 from pg_roles where rolname = $1', [target.user])
  if (userRes.rows.length === 0) {
    await admin.query(
      `create role ${quoteIdent(target.user)} with login password ${quoteLiteral(target.pass)}`,
    )
  } else {
    await admin.query(
      `alter role ${quoteIdent(target.user)} with login password ${quoteLiteral(target.pass)}`,
    )
  }

  const dbRes = await admin.query('select 1 from pg_database where datname = $1', [target.db])
  if (dbRes.rows.length === 0) {
    await admin.query(
      `create database ${quoteIdent(target.db)} owner ${quoteIdent(target.user)}`,
    )
  }

  await admin.query(`grant all privileges on database ${quoteIdent(target.db)} to ${quoteIdent(target.user)}`)
  console.log(JSON.stringify({ ok: true, step: 'role_and_database', user: target.user, database: target.db }))
} finally {
  await admin.end()
}

const sqlPath = path.join(root, 'db', 'migrations', '001_init.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

const appClient = new Client({ connectionString: dbUrl })
await appClient.connect()
try {
  await appClient.query(sql)
  console.log(JSON.stringify({ ok: true, step: 'migration', file: path.relative(root, sqlPath) }))
} finally {
  await appClient.end()
}
