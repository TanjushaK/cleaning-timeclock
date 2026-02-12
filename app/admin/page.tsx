'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Role = 'admin' | 'worker'
type JobStatus = 'planned' | 'in_progress' | 'done'

type Worker = {
  id: string
  full_name: string | null
  phone: string | null
  role: Role
}

type Site = {
  id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  radius: number | null
}

type Job = {
  id: string
  job_date: string
  scheduled_time: string | null
  status: JobStatus
  worker_id: string
  site_id: string
  worker?: Worker
  site?: Site
  profiles?: Worker
  sites?: Site
}

function formatDMY(isoDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return isoDate
  return `${m[3]}-${m[2]}-${m[1]}`
}

function normalizeTime(t: string | null) {
  if (!t) return null
  const m = /^(\d{2}):(\d{2})/.exec(t)
  if (!m) return t
  return `${m[1]}:${m[2]}`
}

function parseDMY(dmy: string) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim())
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  if (yyyy < 2000 || yyyy > 2100) return null
  if (mm < 1 || mm > 12) return null
  if (dd < 1 || dd > 31) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function isHHMM(v: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim())
  if (!m) return false
  const hh = Number(m[1])
  const mm = Number(m[2])
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59
}

function navUrl(site: { lat: number | null; lng: number | null; address: string }) {
  if (site.lat != null && site.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.address)}`
}

// OSM embed без ключей
function osmEmbedSrc(lat: number, lng: number) {
  const d = 0.01
  const left = lng - d
  const right = lng + d
  const top = lat + d
  const bottom = lat - d
  const bbox = `${left},${bottom},${right},${top}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`
}

function osmOpenUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'workers' | 'sites' | 'jobs' | 'reports' | 'schedule'>('workers')

  const [workers, setWorkers] = useState<Worker[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatus | 'all'>('all')

  const [newSite, setNewSite] = useState({
    name: '',
    address: '',
    radius: 100,
    lat: '',
    lng: '',
  })

  const [geoPreview, setGeoPreview] = useState<{
    status: 'idle' | 'loading' | 'ok' | 'err'
    address: string
    lat: number | null
    lng: number | null
    display_name: string | null
    error: string | null
  }>({ status: 'idle', address: '', lat: null, lng: null, display_name: null, error: null })

  const [newJob, setNewJob] = useState({
    dmy: '',
    time: '',
    worker_id: '',
    site_id: '',
  })

  function popToast(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1200)
  }

  const filteredJobs = useMemo(() => {
    const list = [...jobs]
    if (jobStatusFilter === 'all') return list
    return list.filter((j) => j.status === jobStatusFilter)
  }, [jobs, jobStatusFilter])

  function apiHeaders(extra?: Record<string, string>) {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(extra || {}),
    }
    if (token) h.Authorization = `Bearer ${token}`
    return h
  }

  async function apiGet(url: string) {
    const r = await fetch(url, { headers: apiHeaders() })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j
  }

  async function apiSend(url: string, method: string, body?: any) {
    const r = await fetch(url, {
      method,
      headers: apiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j
  }

  async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; display_name?: string | null }> {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || `geocode_http_${r.status}`)
    return { lat: Number(j.lat), lng: Number(j.lng), display_name: j.display_name || null }
  }

  async function loadRoleAndToken() {
    setLoading(true)
    setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const sess = data?.session
      if (!sess) {
        setToken(null)
        setRole(null)
        setLoading(false)
        return
      }

      setToken(sess.access_token)

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', sess.user.id)
        .single()

      if (pErr) throw pErr
      setRole((profile?.role as Role) || null)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка сессии')
    } finally {
      setLoading(false)
    }
  }

  async function loadAll() {
    setErr(null)
    setBusy(true)
    try {
      const w = await apiGet('/api/admin/workers')
      const s = await apiGet('/api/admin/sites')
      const j = await apiGet('/api/admin/jobs')

      const wArr: Worker[] = (w.workers ?? w.data ?? w.items ?? w) || []
      const sArr: Site[] = (s.sites ?? s.data ?? s.items ?? s) || []
      const jArr: Job[] = (j.jobs ?? j.data ?? j.items ?? j) || []

      setWorkers(Array.isArray(wArr) ? wArr : [])
      setSites(Array.isArray(sArr) ? sArr : [])
      setJobs(Array.isArray(jArr) ? jArr : [])
      popToast('Данные обновлены')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadRoleAndToken()
    const sub = supabase.auth.onAuthStateChange(() => loadRoleAndToken())
    return () => sub.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!token) return
    if (role !== 'admin') return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role])

  async function setWorkerRole(workerId: string, newRole: Role) {
    setErr(null)
    setBusy(true)
    try {
      const res = await apiSend(`/api/admin/workers/${workerId}`, 'PATCH', { role: newRole })
      const updated: Worker | undefined = res.worker
      setWorkers((prev) => prev.map((w) => (w.id === workerId ? (updated || { ...w, role: newRole }) : w)))
      popToast(newRole === 'admin' ? 'Назначен админ' : 'Назначен worker')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка изменения роли')
    } finally {
      setBusy(false)
    }
  }

  async function updateSiteCoords(siteId: string, lat: number | null, lng: number | null) {
    setErr(null)
    setBusy(true)
    try {
      await apiSend(`/api/admin/sites/${siteId}`, 'PUT', { lat, lng })
      setSites((prev) => prev.map((s) => (s.id === siteId ? { ...s, lat, lng } : s)))
      popToast('Сохранено')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  async function autoCoordsForSite(site: Site) {
    setErr(null)
    setBusy(true)
    try {
      const g = await geocodeAddress(site.address)
      await updateSiteCoords(site.id, g.lat, g.lng)
      popToast('Координаты определены')
    } catch (e: any) {
      setErr(e?.message || 'Не смог определить координаты')
    } finally {
      setBusy(false)
    }
  }

  async function checkAddress() {
    const address = newSite.address.trim()
    if (!address) {
      setErr('Заполни address')
      return
    }

    setErr(null)
    setGeoPreview({ status: 'loading', address, lat: null, lng: null, display_name: null, error: null })

    try {
      const g = await geocodeAddress(address)
      setGeoPreview({
        status: 'ok',
        address,
        lat: g.lat,
        lng: g.lng,
        display_name: g.display_name || null,
        error: null,
      })
      setNewSite((p) => ({ ...p, lat: String(g.lat), lng: String(g.lng) }))
      popToast('Адрес найден')
    } catch (e: any) {
      setGeoPreview({
        status: 'err',
        address,
        lat: null,
        lng: null,
        display_name: null,
        error: e?.message || 'Ошибка геокодинга',
      })
      setErr(e?.message || 'Ошибка геокодинга')
    }
  }

  async function createSite() {
    setErr(null)

    const name = newSite.name.trim()
    const address = newSite.address.trim()
    if (!name || !address) {
      setErr('Заполни name и address')
      return
    }

    let lat: number | null = newSite.lat.trim() ? Number(newSite.lat.trim()) : null
    let lng: number | null = newSite.lng.trim() ? Number(newSite.lng.trim()) : null
    const radius = Number(newSite.radius)

    setBusy(true)
    try {
      if (lat == null || lng == null) {
        const g = await geocodeAddress(address)
        lat = g.lat
        lng = g.lng
      }

      const body: any = { name, address, radius, lat, lng }
      const res = await apiSend('/api/admin/sites', 'POST', body)
      const created: Site | undefined = res.site

      popToast('Объект создан')
      setNewSite({ name: '', address: '', radius: 100, lat: '', lng: '' })
      setGeoPreview({ status: 'idle', address: '', lat: null, lng: null, display_name: null, error: null })

      if (created) setSites((prev) => [created, ...prev])
      else await loadAll()
    } catch (e: any) {
      setErr(e?.message || 'Ошибка создания объекта')
    } finally {
      setBusy(false)
    }
  }

  async function createJob() {
    setErr(null)

    const iso = parseDMY(newJob.dmy)
    if (!iso) {
      setErr('Дата должна быть ДД-ММ-ГГГГ')
      return
    }
    if (newJob.time.trim() && !isHHMM(newJob.time)) {
      setErr('Время должно быть ЧЧ:ММ')
      return
    }
    if (!newJob.worker_id) {
      setErr('Выбери worker')
      return
    }
    if (!newJob.site_id) {
      setErr('Выбери объект')
      return
    }

    setBusy(true)
    try {
      const body: any = {
        job_date: iso,
        scheduled_time: newJob.time.trim() ? `${newJob.time.trim()}:00` : null,
        worker_id: newJob.worker_id,
        site_id: newJob.site_id,
        status: 'planned',
      }
      const res = await apiSend('/api/admin/jobs', 'POST', body)
      const created: Job | undefined = res.job
      popToast('Задача создана')
      setNewJob({ dmy: '', time: '', worker_id: '', site_id: '' })
      if (created) setJobs((prev) => [created, ...prev])
      else await loadAll()
    } catch (e: any) {
      setErr(e?.message || 'Ошибка создания задачи')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070b] text-zinc-200">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">Загрузка…</div>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#07070b] text-zinc-200">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
            <div className="text-xl font-semibold text-amber-200">/admin</div>
            <div className="mt-2 text-zinc-400">Нет сессии. Сначала войди на главной странице.</div>
            <a
              href="/"
              className="mt-5 inline-flex rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-200 transition hover:bg-amber-300/15"
            >
              На главную
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#07070b] text-zinc-200">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="rounded-3xl border border-red-400/15 bg-[#0b0b12] p-6">
            <div className="text-xl font-semibold text-red-200">Доступ запрещён</div>
            <div className="mt-2 text-zinc-400">Роль должна быть admin.</div>
            <a
              href="/"
              className="mt-5 inline-flex rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-200 transition hover:bg-amber-300/15"
            >
              На главную
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/tanija-logo.png" alt="Tanija" className="h-11 w-11 rounded-2xl" />
            <div>
              <div className="text-2xl font-semibold tracking-tight text-amber-200">Admin</div>
              <div className="text-sm text-zinc-500">Workers • Objects • Jobs</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadAll}
              disabled={busy}
              className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
            >
              {busy ? 'Обновляю…' : 'Обновить данные'}
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut()
                window.location.href = '/'
              }}
              className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 font-semibold text-zinc-200 transition hover:bg-black/40"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ['workers', `Workers (${workers.length})`],
              ['sites', `Objects (${sites.length})`],
              ['jobs', `Jobs (${jobs.length})`],
              ['reports', 'Reports'],
              ['schedule', 'Schedule'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={[
                'rounded-2xl border px-4 py-2 text-sm font-semibold transition',
                tab === k
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                  : 'border-zinc-700/60 bg-black/30 text-zinc-200 hover:bg-black/40',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {toast ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {toast}
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {tab === 'workers' ? (
          <div className="mt-6 rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
            <div className="text-lg font-semibold text-amber-200">Workers</div>
            <div className="mt-4 divide-y divide-zinc-800/80">
              {workers.map((w) => (
                <div key={w.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-zinc-100">{w.full_name || '(без имени)'}</div>
                    <div className="text-sm text-zinc-400">{w.phone || '—'}</div>
                    <div className="mt-1 inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                      {w.role}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {w.role !== 'admin' ? (
                      <button
                        onClick={() => setWorkerRole(w.id, 'admin')}
                        disabled={busy}
                        className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                      >
                        Сделать админом
                      </button>
                    ) : (
                      <button
                        onClick={() => setWorkerRole(w.id, 'worker')}
                        disabled={busy}
                        className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
                      >
                        Сделать worker
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {workers.length === 0 ? <div className="py-6 text-zinc-400">Пока пусто</div> : null}
            </div>
          </div>
        ) : null}

        {tab === 'sites' ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
              <div className="text-lg font-semibold text-amber-200">Создать объект</div>

              <div className="mt-4 space-y-3">
                <input
                  value={newSite.name}
                  onChange={(e) => setNewSite((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Name"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />
                <input
                  value={newSite.address}
                  onChange={(e) => {
                    const v = e.target.value
                    setNewSite((p) => ({ ...p, address: v }))
                    setGeoPreview((g) => (g.status === 'idle' ? g : { ...g, status: 'idle', error: null }))
                  }}
                  placeholder="Address"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />

                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={String(newSite.radius)}
                    onChange={(e) => setNewSite((p) => ({ ...p, radius: Number(e.target.value || 0) }))}
                    placeholder="Radius (m)"
                    className="col-span-1 w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                    inputMode="numeric"
                  />
                  <input
                    value={newSite.lat}
                    onChange={(e) => setNewSite((p) => ({ ...p, lat: e.target.value }))}
                    placeholder="Lat (опц.)"
                    className="col-span-1 w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                    inputMode="decimal"
                  />
                  <input
                    value={newSite.lng}
                    onChange={(e) => setNewSite((p) => ({ ...p, lng: e.target.value }))}
                    placeholder="Lng (опц.)"
                    className="col-span-1 w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                    inputMode="decimal"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={checkAddress}
                    disabled={busy || geoPreview.status === 'loading'}
                    className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
                  >
                    {geoPreview.status === 'loading' ? 'Проверяю…' : 'Проверить адрес'}
                  </button>

                  <button
                    onClick={createSite}
                    disabled={busy}
                    className="flex-1 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                  >
                    Создать объект
                  </button>
                </div>

                {geoPreview.status === 'ok' && geoPreview.lat != null && geoPreview.lng != null ? (
                  <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                    <div className="text-sm font-semibold text-emerald-200">Найдено</div>
                    <div className="mt-1 text-xs text-zinc-300 break-words">{geoPreview.display_name || '—'}</div>
                    <div className="mt-2 text-xs text-zinc-400">
                      lat: <span className="text-zinc-200">{geoPreview.lat}</span> • lng:{' '}
                      <span className="text-zinc-200">{geoPreview.lng}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/15"
                        href={navUrl({ lat: geoPreview.lat, lng: geoPreview.lng, address: geoPreview.address })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть навигацию
                      </a>
                      <a
                        className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40"
                        href={osmOpenUrl(geoPreview.lat, geoPreview.lng)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть карту
                      </a>
                    </div>

                    <iframe
                      title="map-preview"
                      className="mt-3 h-64 w-full rounded-2xl border border-zinc-800/80 bg-black/20"
                      src={osmEmbedSrc(geoPreview.lat, geoPreview.lng)}
                    />
                    <div className="mt-2 text-xs text-zinc-500">
                      Если попал “не туда” — поправь Address или вручную Lat/Lng.
                    </div>
                  </div>
                ) : null}

                {geoPreview.status === 'err' ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {geoPreview.error || 'Ошибка проверки адреса'}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
              <div className="text-lg font-semibold text-amber-200">Objects</div>

              <div className="mt-4 space-y-3">
                {sites.map((s) => (
                  <div key={s.id} className="rounded-3xl border border-zinc-800/80 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-semibold text-zinc-100">{s.name}</div>
                        <div className="text-sm text-zinc-400">{s.address}</div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {s.lat == null || s.lng == null ? (
                            <span className="inline-flex rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                              нет lat/lng
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                              gps ok
                            </span>
                          )}
                          <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                            радиус {s.radius ?? 0}м
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40"
                          href={navUrl(s)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Навигация
                        </a>

                        {s.lat == null || s.lng == null ? (
                          <button
                            onClick={() => autoCoordsForSite(s)}
                            disabled={busy}
                            className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                          >
                            Авто-координаты
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input
                        defaultValue={s.lat ?? ''}
                        placeholder="Lat"
                        className="w-full rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm outline-none focus:border-amber-300/60"
                        inputMode="decimal"
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          const lat = v ? Number(v) : null
                          if (v && !Number.isFinite(lat as any)) return
                          updateSiteCoords(s.id, lat, s.lng)
                        }}
                      />
                      <input
                        defaultValue={s.lng ?? ''}
                        placeholder="Lng"
                        className="w-full rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm outline-none focus:border-amber-300/60"
                        inputMode="decimal"
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          const lng = v ? Number(v) : null
                          if (v && !Number.isFinite(lng as any)) return
                          updateSiteCoords(s.id, s.lat, lng)
                        }}
                      />
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">Можно вручную поправить (если геокодер промахнулся)</div>
                  </div>
                ))}
                {sites.length === 0 ? <div className="text-zinc-400">Пока пусто</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'jobs' ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
              <div className="text-lg font-semibold text-amber-200">Создать задачу</div>

              <div className="mt-4 space-y-3">
                <input
                  value={newJob.dmy}
                  onChange={(e) => setNewJob((p) => ({ ...p, dmy: e.target.value }))}
                  placeholder="Дата (ДД-ММ-ГГГГ)"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />
                <input
                  value={newJob.time}
                  onChange={(e) => setNewJob((p) => ({ ...p, time: e.target.value }))}
                  placeholder="Время (ЧЧ:ММ) — опционально"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />

                <select
                  value={newJob.worker_id}
                  onChange={(e) => setNewJob((p) => ({ ...p, worker_id: e.target.value }))}
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                >
                  <option value="">Выбери worker</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {(w.full_name || w.id).slice(0, 60)}
                    </option>
                  ))}
                </select>

                <select
                  value={newJob.site_id}
                  onChange={(e) => setNewJob((p) => ({ ...p, site_id: e.target.value }))}
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                >
                  <option value="">Выбери объект</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={createJob}
                  disabled={busy}
                  className="w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                >
                  Создать задачу
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-lg font-semibold text-amber-200">Jobs</div>

                <div className="flex flex-wrap gap-2">
                  {(['all', 'planned', 'in_progress', 'done'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setJobStatusFilter(s)}
                      className={[
                        'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                        jobStatusFilter === s
                          ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                          : 'border-zinc-700/60 bg-black/30 text-zinc-200 hover:bg-black/40',
                      ].join(' ')}
                    >
                      {s === 'all' ? 'All' : s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {filteredJobs.map((j) => {
                  const site = (j.site || j.sites) as Site | undefined
                  const worker = (j.worker || j.profiles) as Worker | undefined

                  const dt = formatDMY(j.job_date)
                  const tm = normalizeTime(j.scheduled_time)

                  return (
                    <div key={j.id} className="rounded-3xl border border-zinc-800/80 bg-black/20 p-4">
                      <div className="font-semibold text-zinc-100">
                        {dt}
                        {tm ? ` ${tm}` : ''}
                      </div>
                      <div className="mt-1 text-sm text-zinc-400">
                        {site ? `${site.name} — ${site.address}` : `site_id: ${j.site_id}`}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {worker ? `worker: ${worker.full_name || worker.id}` : `worker_id: ${j.worker_id}`}
                      </div>

                      <div className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                        {j.status}
                      </div>
                    </div>
                  )
                })}
                {filteredJobs.length === 0 ? <div className="text-zinc-400">Пока пусто</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'reports' ? (
          <div className="mt-6 rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6 text-zinc-400">
            Reports — в разработке
          </div>
        ) : null}

        {tab === 'schedule' ? (
          <div className="mt-6 rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6 text-zinc-400">
            Schedule — в разработке
          </div>
        ) : null}
      </div>
    </div>
  )
}
