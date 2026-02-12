'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Role = 'admin' | 'worker'
type JobStatus = 'planned' | 'in_progress' | 'done'

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
  site_id: string
  worker_id: string
  sites?: Site | null
}

type ActiveLog = {
  id: string
  job_id: string
  start_at: string
}

function formatDMY(isoDate: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return isoDate
  return `${m[3]}-${m[2]}-${m[1]}`
}

function formatDMYHM(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`
}

function normalizeTime(t: string | null) {
  if (!t) return null
  const m = /^(\d{2}):(\d{2})/.exec(t)
  if (!m) return t
  return `${m[1]}:${m[2]}`
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function navUrl(site: { lat: number | null; lng: number | null; address: string }) {
  if (site.lat != null && site.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(site.address)}`
}

async function getGeo(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return await new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation_not_supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => reject(new Error(err?.message || 'geolocation_error')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [activeLogs, setActiveLogs] = useState<Record<string, ActiveLog>>({})

  const jobsByStatus = useMemo(() => {
    const planned: Job[] = []
    const inProgress: Job[] = []
    const done: Job[] = []
    for (const j of jobs) {
      if (j.status === 'planned') planned.push(j)
      else if (j.status === 'in_progress') inProgress.push(j)
      else done.push(j)
    }
    return { planned, inProgress, done }
  }, [jobs])

  function popToast(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1200)
  }

  async function syncSession() {
    setLoading(true)
    setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const s = data?.session
      if (!s?.user) {
        setUserId(null)
        setSessionEmail(null)
        setRole(null)
        setJobs([])
        setActiveLogs({})
        setLoading(false)
        return
      }

      setUserId(s.user.id)
      setSessionEmail(s.user.email || null)

      const { data: prof, error: pErr } = await supabase.from('profiles').select('role').eq('id', s.user.id).single()
      if (pErr) throw pErr
      setRole((prof?.role as Role) || null)
    } catch (e: any) {
      setErr(e?.message || 'session_error')
    } finally {
      setLoading(false)
    }
  }

  async function loadWorkerData(uid: string) {
    setErr(null)
    setBusy(true)
    try {
      const { data: jData, error: jErr } = await supabase
        .from('jobs')
        .select('id, job_date, scheduled_time, status, site_id, worker_id, sites (id, name, address, lat, lng, radius)')
        .eq('worker_id', uid)
        .order('job_date', { ascending: true })

      if (jErr) throw jErr
      const list: Job[] = (jData || []) as any
      setJobs(list)

      const { data: lData, error: lErr } = await supabase
        .from('time_logs')
        .select('id, job_id, start_at')
        .eq('worker_id', uid)
        .is('stop_at', null)

      if (lErr) throw lErr

      const map: Record<string, ActiveLog> = {}
      for (const row of (lData || []) as any[]) {
        map[row.job_id] = { id: row.id, job_id: row.job_id, start_at: row.start_at }
      }
      setActiveLogs(map)

      popToast('Данные обновлены')
    } catch (e: any) {
      setErr(e?.message || 'load_error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    syncSession()
    const sub = supabase.auth.onAuthStateChange(() => syncSession())
    return () => sub.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    loadWorkerData(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function signIn() {
    setErr(null)
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      popToast('Вход выполнен')
    } catch (e: any) {
      setErr(e?.message || 'login_error')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      await supabase.auth.signOut()
      popToast('Выход')
    } finally {
      setBusy(false)
    }
  }

  async function startJob(job: Job) {
    setErr(null)
    if (!userId) return
    const site = job.sites || null

    if (!site) {
      setErr('site_missing')
      return
    }
    if (site.lat == null || site.lng == null) {
      setErr('На объекте нет координат (lat/lng). START запрещён.')
      return
    }
    const radius = site.radius ?? 0
    if (radius <= 0) {
      setErr('У объекта radius=0. START запрещён.')
      return
    }

    setBusy(true)
    setBusyJobId(job.id)
    try {
      const g = await getGeo()
      if (g.accuracy > 80) {
        setErr(`GPS точность плохая: ${Math.round(g.accuracy)}м (нужно ≤ 80м)`)
        return
      }

      const dist = haversineMeters(g.lat, g.lng, site.lat, site.lng)
      if (dist > radius) {
        setErr(`Ты далеко от объекта: ${Math.round(dist)}м (нужно ≤ ${radius}м)`)
        return
      }

      const now = new Date().toISOString()

      const { error: insErr } = await supabase.from('time_logs').insert({
        job_id: job.id,
        worker_id: userId,
        start_at: now,
        start_lat: g.lat,
        start_lng: g.lng,
        start_accuracy: g.accuracy,
      } as any)
      if (insErr) throw insErr

      const { error: upErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', job.id)
      if (upErr) throw upErr

      popToast('START OK')
      await loadWorkerData(userId)
    } catch (e: any) {
      setErr(e?.message || 'start_error')
    } finally {
      setBusy(false)
      setBusyJobId(null)
    }
  }

  async function stopJob(job: Job) {
    setErr(null)
    if (!userId) return
    const active = activeLogs[job.id]
    if (!active?.id) {
      setErr('active_log_not_found')
      return
    }

    setBusy(true)
    setBusyJobId(job.id)
    try {
      const g = await getGeo()
      if (g.accuracy > 80) {
        setErr(`GPS точность плохая: ${Math.round(g.accuracy)}м (нужно ≤ 80м)`)
        return
      }

      const now = new Date().toISOString()

      const { error: logErr } = await supabase
        .from('time_logs')
        .update({
          stop_at: now,
          stop_lat: g.lat,
          stop_lng: g.lng,
          stop_accuracy: g.accuracy,
        } as any)
        .eq('id', active.id)
      if (logErr) throw logErr

      const { error: upErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', job.id)
      if (upErr) throw upErr

      popToast('STOP OK')
      await loadWorkerData(userId)
    } catch (e: any) {
      setErr(e?.message || 'stop_error')
    } finally {
      setBusy(false)
      setBusyJobId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/tanija-logo.png" alt="Tanija" className="h-11 w-11 rounded-2xl" />
            <div>
              <div className="text-2xl font-semibold tracking-tight text-amber-200">Tanija</div>
              <div className="text-sm text-zinc-500">Cleaning Timeclock</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {userId ? (
              <>
                <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 px-4 py-2 text-sm text-zinc-200">
                  {sessionEmail || '—'} {role ? <span className="text-zinc-500">• {role}</span> : null}
                </div>

                <button
                  onClick={() => userId && loadWorkerData(userId)}
                  disabled={busy}
                  className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                >
                  {busy ? '…' : 'Обновить'}
                </button>

                {role === 'admin' ? (
                  <Link
                    href="/admin"
                    className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 font-semibold text-zinc-200 transition hover:bg-black/40"
                  >
                    Админка
                  </Link>
                ) : null}

                <button
                  onClick={signOut}
                  disabled={busy}
                  className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
                >
                  Выйти
                </button>
              </>
            ) : null}
          </div>
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

        {loading ? (
          <div className="mt-6 rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">Загрузка…</div>
        ) : null}

        {!loading && !userId ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-8">
              <div className="text-xl font-semibold text-amber-200">Вход</div>
              <div className="mt-2 text-sm text-zinc-500">Формат дат: ДД-ММ-ГГГГ • ДД-ММ-ГГГГ ЧЧ:ММ</div>

              <div className="mt-6 space-y-3">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                  autoComplete="email"
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                  autoComplete="current-password"
                />

                <button
                  onClick={signIn}
                  disabled={busy || !email.trim() || !password}
                  className="w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                >
                  {busy ? 'Вхожу…' : 'Войти'}
                </button>

                <div className="flex items-center justify-between text-sm">
                  <Link href="/forgot-password" className="text-zinc-400 hover:text-amber-200 transition">
                    Забыли пароль?
                  </Link>
                  <span className="text-zinc-600">GPS должен быть включён</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-8">
              <div className="text-xl font-semibold text-amber-200">Как работает</div>
              <div className="mt-4 space-y-2 text-sm text-zinc-400">
                <div>1) Войти</div>
                <div>2) Открыть задачу</div>
                <div>3) START (GPS ≤ 80м и дистанция ≤ радиус)</div>
                <div>4) STOP (закрывает time log и ставит DONE)</div>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && userId ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-6">
              <div className="text-lg font-semibold text-amber-200">Мои задачи</div>

              {jobs.length === 0 ? <div className="mt-4 text-zinc-400">Задач нет</div> : null}

              <div className="mt-4 space-y-3">
                {jobs.map((j) => {
                  const site = j.sites || null
                  const t = normalizeTime(j.scheduled_time)
                  const active = activeLogs[j.id]
                  const isBusy = busy && busyJobId === j.id

                  return (
                    <div key={j.id} className="rounded-3xl border border-zinc-800/80 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-semibold text-zinc-100">
                            {formatDMY(j.job_date)}
                            {t ? ` ${t}` : ''}
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {site ? `${site.name} — ${site.address}` : 'Объект не найден'}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                              {j.status}
                            </span>

                            {site && (site.lat == null || site.lng == null) ? (
                              <span className="inline-flex rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                                нет lat/lng
                              </span>
                            ) : null}

                            {site ? (
                              <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                                радиус {site.radius ?? 0}м
                              </span>
                            ) : null}

                            {active?.start_at ? (
                              <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                started {formatDMYHM(active.start_at)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {site ? (
                            <a
                              href={navUrl(site)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40"
                            >
                              Навигация
                            </a>
                          ) : null}

                          {j.status === 'planned' ? (
                            <button
                              onClick={() => startJob(j)}
                              disabled={isBusy}
                              className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                            >
                              {isBusy ? 'START…' : 'START'}
                            </button>
                          ) : null}

                          {j.status === 'in_progress' ? (
                            <button
                              onClick={() => stopJob(j)}
                              disabled={isBusy}
                              className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-50"
                            >
                              {isBusy ? 'STOP…' : 'STOP'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="text-center text-xs text-zinc-600">
              Формат: ДД-ММ-ГГГГ и ДД-ММ-ГГГГ ЧЧ:ММ • GPS accuracy ≤ 80м
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
