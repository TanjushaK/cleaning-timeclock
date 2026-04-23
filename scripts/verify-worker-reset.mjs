import fs from 'fs'

function readLocalAdminCreds() {
  const txt = fs.readFileSync('./var/logs/local-admin-credentials.txt', 'utf8').replace(/^\uFEFF/, '')
  const lines = txt.split(/\r?\n/)
  const email = (lines.find((l) => l.startsWith('EMAIL=')) || '').slice(6).trim()
  const password = (lines.find((l) => l.startsWith('PASSWORD=')) || '').slice(9).trim()
  if (!email || !password) throw new Error('Missing local admin credentials')
  return { email, password }
}

async function postJson(url, payload, token) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  const json = await res.json().catch(() => ({}))
  return { res, json }
}

async function getJson(url, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, { headers })
  const json = await res.json().catch(() => ({}))
  return { res, json }
}

const { email, password } = readLocalAdminCreds()

const adminLogin = await postJson('http://127.0.0.1:3000/api/auth/login', { email, password })
if (!adminLogin.res.ok || !adminLogin.json?.access_token) throw new Error('Admin login failed')
const adminToken = String(adminLogin.json.access_token)

const workersList = await getJson('http://127.0.0.1:3000/api/admin/workers/list', adminToken)
if (!workersList.res.ok) throw new Error('Workers list request failed')

const workers = (Array.isArray(workersList.json?.workers) ? workersList.json.workers : [])
  .filter((w) => String(w?.role || '') === 'worker')
  .slice(0, 2)
if (workers.length < 2) throw new Error('Need at least 2 worker users')

const verified = []
for (const w of workers) {
  const workerId = String(w.id || '').trim()
  if (!workerId) continue

  const reset = await postJson('http://127.0.0.1:3000/api/admin/workers/reset-password', { worker_id: workerId }, adminToken)
  if (!reset.res.ok || !reset.json?.temp_password) throw new Error(`Reset failed for ${workerId}`)

  const workerLogin = await postJson('http://127.0.0.1:3000/api/auth/login', {
    email: reset.json.login,
    password: reset.json.temp_password,
  })
  if (!workerLogin.res.ok) throw new Error(`Worker login failed for ${workerId}`)

  const card = await getJson(`http://127.0.0.1:3000/api/admin/workers/${encodeURIComponent(workerId)}`, adminToken)
  if (!card.res.ok) throw new Error(`Worker card failed for ${workerId}`)

  verified.push({
    id: workerId,
    login: String(reset.json.login || ''),
    temp_password: String(reset.json.temp_password || ''),
    worker_login_status: workerLogin.res.status,
    card_status: card.res.status,
  })
}

console.log(
  JSON.stringify(
    {
      ok: true,
      workers_list_count: Array.isArray(workersList.json?.workers) ? workersList.json.workers.length : 0,
      verified,
    },
    null,
    2,
  ),
)

