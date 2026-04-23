import crypto from 'crypto'
import { Client } from 'pg'
import { loadEnvLocal } from './load-env-local.mjs'

loadEnvLocal()

function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error)
      resolve(derivedKey)
    })
  })
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await scryptAsync(password, salt)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

const client = new Client({ connectionString: required('DATABASE_URL') })
await client.connect()

try {
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase()
  const password = required('BOOTSTRAP_ADMIN_PASSWORD')
  const fullName = String(process.env.BOOTSTRAP_ADMIN_FULL_NAME || 'Admin').trim() || 'Admin'
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)

  await client.query('begin')
  await client.query(
    `insert into app_users (id, email, password_hash, email_confirmed_at, user_metadata)
     values ($1, $2, $3, now(), $4::jsonb)
     on conflict (email) do update set
       password_hash = excluded.password_hash,
       email_confirmed_at = now(),
       updated_at = now()`,
    [id, email, passwordHash, JSON.stringify({ temp_password: false, bootstrap: true })],
  )
  const userRes = await client.query('select id from app_users where email = $1 limit 1', [email])
  const userId = userRes.rows[0].id
  await client.query(
    `insert into profiles (id, role, active, full_name, email, full_name_i18n)
     values ($1, 'admin', true, $2, $3, $4::jsonb)
     on conflict (id) do update set
       role = 'admin',
       active = true,
       full_name = excluded.full_name,
       email = excluded.email,
       full_name_i18n = excluded.full_name_i18n,
       updated_at = now()`,
    [userId, fullName, email, JSON.stringify({ ru: fullName })],
  )
  await client.query('commit')
  console.log(JSON.stringify({ ok: true, user_id: userId, email }, null, 2))
} catch (error) {
  await client.query('rollback').catch(() => {})
  throw error
} finally {
  await client.end()
}
