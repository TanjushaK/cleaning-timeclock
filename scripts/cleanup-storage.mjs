/**
 * Safe production cleanup for worker-admin chat uploads and rollback snapshots.
 * Default is dry-run (no deletion). Use --apply to delete files.
 *
 * Loads env: /etc/timeclock/timeclock.env if present, else .env.production at repo root.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const ROLLBACK_PARENT = '/var/tmp/tanjusha-rollback'
const ROLLBACK_PREFIX = 'timeclock-'

function parseArgs(argv) {
  const out = {
    apply: false,
    deletedAttachmentsDays: 30,
    orphanDays: 30,
    rollbackDays: 14,
  }
  for (const a of argv) {
    if (a === '--apply') out.apply = true
    else if (a.startsWith('--deleted-attachments-days=')) {
      const n = Number.parseInt(a.split('=')[1], 10)
      if (Number.isFinite(n) && n >= 0) out.deletedAttachmentsDays = n
    } else if (a.startsWith('--orphan-days=')) {
      const n = Number.parseInt(a.split('=')[1], 10)
      if (Number.isFinite(n) && n >= 0) out.orphanDays = n
    } else if (a.startsWith('--rollback-days=')) {
      const n = Number.parseInt(a.split('=')[1], 10)
      if (Number.isFinite(n) && n >= 0) out.rollbackDays = n
    }
  }
  return out
}

function parseBucketRef(raw, fallbackBucket) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

function parseEnvLine(line) {
  const t = String(line || '').trim()
  if (!t || t.startsWith('#')) return null
  let rest = t
  if (/^export\s+/i.test(rest)) rest = rest.replace(/^export\s+/i, '').trim()
  const eq = rest.indexOf('=')
  if (eq <= 0) return null
  const key = rest.slice(0, eq).trim()
  let val = rest.slice(eq + 1).trim()
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1)
  }
  return { key, val }
}

function loadEnvFiles() {
  const etc = '/etc/timeclock/timeclock.env'
  const prod = path.join(ROOT, '.env.production')
  if (fs.existsSync(etc)) {
    applyEnvFile(etc)
  } else if (fs.existsSync(prod)) {
    applyEnvFile(prod)
  }
}

function applyEnvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    process.env[parsed.key] = parsed.val
  }
}

function resolveUploadRoot() {
  const raw = process.env.UPLOAD_ROOT || process.env.STORAGE_ROOT || './var/uploads'
  return path.resolve(process.cwd(), raw)
}

function assertSafeUploadRoot(absRoot) {
  const norm = path.normalize(absRoot)
  if (!norm || norm.length === 0) throw new Error('Unsafe UPLOAD_ROOT: empty')
  const forbidden = ['/', path.normalize('/opt'), path.normalize('/opt/timeclock')]
  if (forbidden.includes(norm)) throw new Error(`Unsafe UPLOAD_ROOT: ${norm}`)
}

function fsPathToDbPath(p) {
  return p.split(path.sep).join('/')
}

function isUnderRoot(root, candidate) {
  const absRoot = path.normalize(root)
  const absCandidate = path.normalize(candidate)
  const rel = path.relative(absRoot, absCandidate)
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function absoluteAttachmentPath(uploadRoot, bucket, objectPath) {
  const obj = String(objectPath || '').trim()
  if (!obj || obj.includes('..')) throw new Error('invalid object path')
  return path.normalize(path.join(uploadRoot, bucket, obj))
}

async function walkFilesRecursive(dir) {
  const out = []
  let entries = []
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walkFilesRecursive(p)))
    } else if (e.isFile()) {
      out.push(p)
    }
  }
  return out
}

async function cleanupDeletedAttachments(client, opts, uploadRoot, bucket, stats, apply) {
  const cutoff = new Date(Date.now() - opts.deletedAttachmentsDays * 864e5)
  const q = `
    select id, path
      from worker_admin_message_attachments
     where deleted_at is not null
       and deleted_at < $1::timestamptz
  `
  const { rows } = await client.query(q, [cutoff.toISOString()])
  stats.deletedAttachments.scanned = rows.length

  for (const row of rows) {
    const objectPath = String(row.path || '').trim()
    if (!objectPath || objectPath.includes('..')) {
      stats.deletedAttachments.skipped++
      continue
    }
    let abs
    try {
      abs = absoluteAttachmentPath(uploadRoot, bucket, objectPath)
    } catch {
      stats.deletedAttachments.errors.push(`bad path row ${row.id}`)
      continue
    }
    if (!isUnderRoot(uploadRoot, abs)) {
      stats.deletedAttachments.errors.push(`path escape row ${row.id}`)
      continue
    }

    let exists = false
    try {
      exists = fs.existsSync(abs)
    } catch {
      stats.deletedAttachments.errors.push(`stat failed row ${row.id}`)
      continue
    }

    if (!exists) {
      stats.deletedAttachments.skipped++
      continue
    }

    stats.deletedAttachments.wouldDelete++
    if (apply) {
      try {
        await fs.promises.unlink(abs)
        stats.deletedAttachments.deleted++
      } catch (e) {
        stats.deletedAttachments.errors.push(String(e?.message || e).slice(0, 200))
      }
    }
  }
}

async function cleanupOrphans(client, opts, uploadRoot, bucket, stats, apply) {
  const workersRoot = path.join(uploadRoot, bucket, 'workers')
  if (!fs.existsSync(workersRoot)) return

  let workerDirs = []
  try {
    workerDirs = await fs.promises.readdir(workersRoot, { withFileTypes: true })
  } catch {
    return
  }

  const cutoffMs = Date.now() - opts.orphanDays * 864e5
  const bucketRoot = path.join(uploadRoot, bucket)

  for (const wd of workerDirs) {
    if (!wd.isDirectory()) continue
    const adminChat = path.join(workersRoot, wd.name, 'admin-chat')
    if (!fs.existsSync(adminChat)) continue

    const files = await walkFilesRecursive(adminChat)
    for (const absFile of files) {
      stats.orphans.scanned++

      let st
      try {
        st = await fs.promises.stat(absFile)
      } catch {
        stats.orphans.errors.push(`stat ${absFile}`)
        continue
      }
      if (st.mtimeMs > cutoffMs) {
        stats.orphans.skipped++
        continue
      }

      const relFromBucket = path.relative(bucketRoot, absFile)
      if (relFromBucket.startsWith('..') || path.isAbsolute(relFromBucket)) {
        stats.orphans.errors.push('relative path escape')
        continue
      }
      const dbPath = fsPathToDbPath(relFromBucket)

      const { rows } = await client.query(
        `select 1 from worker_admin_message_attachments
          where path = $1 and deleted_at is null limit 1`,
        [dbPath],
      )
      if (rows.length > 0) {
        stats.orphans.skipped++
        continue
      }

      stats.orphans.wouldDelete++
      if (apply) {
        try {
          await fs.promises.unlink(absFile)
          stats.orphans.deleted++
        } catch (e) {
          stats.orphans.errors.push(String(e?.message || e).slice(0, 200))
        }
      }
    }
  }
}

async function cleanupRollbacks(opts, stats, apply) {
  if (!fs.existsSync(ROLLBACK_PARENT)) return

  let entries = []
  try {
    entries = await fs.promises.readdir(ROLLBACK_PARENT, { withFileTypes: true })
  } catch {
    return
  }

  const cutoffMs = Date.now() - opts.rollbackDays * 864e5

  for (const ent of entries) {
    if (!ent.name.startsWith(ROLLBACK_PREFIX)) continue

    const full = path.join(ROLLBACK_PARENT, ent.name)
    stats.rollbacks.scanned++

    let st
    try {
      st = await fs.promises.stat(full)
    } catch {
      stats.rollbacks.errors.push(`stat ${ent.name}`)
      continue
    }

    if (st.mtimeMs > cutoffMs) {
      stats.rollbacks.skipped++
      continue
    }

    stats.rollbacks.wouldDelete++
    if (apply) {
      try {
        await fs.promises.rm(full, { recursive: true, force: true })
        stats.rollbacks.deleted++
      } catch (e) {
        stats.rollbacks.errors.push(String(e?.message || e).slice(0, 200))
      }
    }
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const opts = parseArgs(argv)
  const dryRun = !opts.apply

  loadEnvFiles()

  const databaseUrl = String(process.env.DATABASE_URL || '').trim()
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set (load /etc/timeclock/timeclock.env or .env.production).')
    process.exit(1)
  }

  const uploadRoot = resolveUploadRoot()
  assertSafeUploadRoot(uploadRoot)

  const rawBucket = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'
  const { bucket } = parseBucketRef(rawBucket, 'site-photos')

  const stats = {
    deletedAttachments: { scanned: 0, wouldDelete: 0, deleted: 0, skipped: 0, errors: [] },
    orphans: { scanned: 0, wouldDelete: 0, deleted: 0, skipped: 0, errors: [] },
    rollbacks: { scanned: 0, wouldDelete: 0, deleted: 0, skipped: 0, errors: [] },
  }

  console.log(`mode=${dryRun ? 'dry-run' : 'apply'}`)
  console.log(`upload_root=${uploadRoot}`)
  console.log(`bucket=${bucket}`)
  console.log(`deleted_attachments_days=${opts.deletedAttachmentsDays}`)
  console.log(`orphan_days=${opts.orphanDays}`)
  console.log(`rollback_days=${opts.rollbackDays}`)
  console.log('')

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await cleanupDeletedAttachments(client, opts, uploadRoot, bucket, stats, opts.apply)
    await cleanupOrphans(client, opts, uploadRoot, bucket, stats, opts.apply)
  } finally {
    await client.end()
  }

  await cleanupRollbacks(opts, stats, opts.apply)

  console.log('=== summary ===')
  console.log(JSON.stringify(stats, null, 2))
  if (dryRun && (stats.deletedAttachments.wouldDelete > 0 || stats.orphans.wouldDelete > 0 || stats.rollbacks.wouldDelete > 0)) {
    console.log('\nRe-run with --apply to delete listed items.')
  }
}

main().catch((e) => {
  console.error(String(e?.message || e))
  process.exit(1)
})
