import crypto from 'crypto'
import { Client } from 'pg'
import { loadEnvLocal } from './load-env-local.mjs'

loadEnvLocal()

function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

const KEY_LEN = 64

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, (error, derivedKey) => {
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

function inferName(email, fallbackId) {
  const local = String(email || '')
    .trim()
    .split('@')[0]
    .trim()
  const base = local || String(fallbackId || '').slice(0, 8) || 'worker'
  return base.replace(/[._-]+/g, ' ').trim() || 'worker'
}

function tempPasswordForId(id) {
  const short = String(id || '').replace(/-/g, '').slice(0, 6)
  return `Tc!${short}`
}

const client = new Client({ connectionString: required('DATABASE_URL') })
await client.connect()

const imported = []
const skipped = []

try {
  await client.query('begin')

  const adminRows = await client.query(`select id::text as id from profiles where role = 'admin'`)
  const adminIds = new Set(adminRows.rows.map((r) => String(r.id)))

  const stageRows = await client.query(`
    select
      nullif(trim(id), '') as id,
      nullif(trim(email), '') as email,
      nullif(trim(phone), '') as phone
    from public.users_csv_stage_apply
    where nullif(trim(id), '') is not null
      and nullif(trim(email), '') is not null
    order by id
  `)

  for (const row of stageRows.rows) {
    const id = String(row.id)
    const email = String(row.email).toLowerCase()
    const phone = row.phone ? String(row.phone) : null

    if (adminIds.has(id)) {
      skipped.push({ id, email, reason: 'admin-id' })
      continue
    }

    const conflict = await client.query(
      `select id::text as id from app_users where lower(email) = lower($1) limit 1`,
      [email],
    )
    if (conflict.rows[0] && String(conflict.rows[0].id) !== id) {
      skipped.push({ id, email, reason: 'email-conflict' })
      continue
    }

    const tempPassword = tempPasswordForId(id)
    const passwordHash = await hashPassword(tempPassword)
    const fullName = inferName(email, id)

    await client.query(
      `
      insert into app_users (
        id, email, phone, password_hash, email_confirmed_at, phone_confirmed_at, user_metadata
      ) values ($1::uuid, $2::text, $3::text, $4::text, now(), case when $3::text is not null then now() else null end, $5::jsonb)
      on conflict (id) do update set
        email = excluded.email,
        phone = excluded.phone,
        password_hash = excluded.password_hash,
        email_confirmed_at = now(),
        phone_confirmed_at = case when excluded.phone is not null then now() else app_users.phone_confirmed_at end,
        user_metadata = excluded.user_metadata,
        updated_at = now()
      `,
      [id, email, phone, passwordHash, JSON.stringify({ imported_from_users_csv: true, temp_password: true })],
    )

    await client.query(
      `
      insert into profiles (id, role, active, full_name, email, phone, full_name_i18n, notes_i18n)
      values ($1::uuid, 'worker', true, $2::text, $3::text, $4::text, $5::jsonb, '{}'::jsonb)
      on conflict (id) do update set
        role = case when profiles.role = 'admin' then profiles.role else 'worker' end,
        active = true,
        full_name = coalesce(nullif($2, ''), profiles.full_name),
        email = excluded.email,
        phone = excluded.phone,
        full_name_i18n = excluded.full_name_i18n,
        updated_at = now()
      `,
      [id, fullName, email, phone, JSON.stringify({ ru: fullName })],
    )

    imported.push({ id, email, phone: phone || '', temp_password: tempPassword, role: 'worker', profile_name: fullName })
  }

  await client.query('commit')

  console.log(
    JSON.stringify(
      {
        ok: true,
        imported_count: imported.length,
        skipped_count: skipped.length,
        imported,
        skipped,
      },
      null,
      2,
    ),
  )
} catch (error) {
  await client.query('rollback').catch(() => {})
  throw error
} finally {
  await client.end()
}

