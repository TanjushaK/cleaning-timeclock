'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  worker_id: string
  site_id: string
  sites?: Site | null
}

type TimeLog = {
  id: string
  job_id: string
  worker_id: string
  start_at: string
  stop_at: string | null
  start_lat: number | null
  start_lng: number | null
  start_accuracy: number | null
  stop_lat: number | null
  stop_lng: number | null
  stop_accuracy: number | null
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
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

function formatDT(iso: string) {
  const d = new Date(iso)
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [userId, setUserId] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [activeLogs, setActiveLogs] = useState<Record<string, TimeLog>>({})
  const [filter, setFilter] = useState<JobStatus | 'all'>('all')

  const [gps, setGps] = useState<{
    ok: boolean
    lat: number | null
    lng: number | null
    accuracy: number | null
    updatedAt: number | null
    message: string | null
  }>({ ok: false, lat: null, lng: null, accuracy: null, updatedAt: null, message: null })

  const watchIdRef = useRef<number | null>(null)

  const canLogin = useMemo(() => email.trim().includes('@') && password.length >= 6, [email, password])

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs
    return jobs.filter((j) => j.status === filter)
  }, [jobs, filter])

  function popToast(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1200)
  }

  async function refreshSession() {
    setLoading(true)
    setErr(null)
    try {
      const { data } = await supabase.auth.getSession()
      const s = data?.session
      if (!s) {
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

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', s.user.id)
        .single()

      if (pErr) throw pErr
      setRole((profile?.role as Role) || null)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка сессии')
    } finally {
      setLoading(false)
    }
  }

  async function loadWorkerData(uid: string) {
    setErr(null)
    try {
      const { data: jobsData, error: jobsErr } = await supabase
        .from('jobs')
        .select('id, job_date, scheduled_time, status, worker_id, site_id, sites(id,name,address,lat,lng,radius)')
        .eq('worker_id', uid)
        .order('job_date', { ascending: false })
        .order('scheduled_time', { ascending: true })

      if (jobsErr) throw jobsErr
      setJobs((jobsData as any) || [])

      const { data: logsData, error: logsErr } = await supabase
        .from('time_logs')
        .select('id, job_id, worker_id, start_at, stop_at, start_lat, start_lng, start_accuracy, stop_lat, stop_lng, stop_accuracy')
        .eq('worker_id', uid)
        .is('stop_at', null)

      if (logsErr) throw logsErr

      const map: Record<string, TimeLog> = {}
      ;((logsData as any) || []).forEach((l: TimeLog) => {
        map[l.job_id] = l
      })
      setActiveLogs(map)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка загрузки задач')
    }
  }

  function stopWatch() {
    if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }

  function startWatch() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps((p) => ({ ...p, ok: false, message: 'Геолокация недоступна' }))
      return
    }
    stopWatch()

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: Date.now(),
          message: null,
        })
      },
      (e) => {
        setGps((p) => ({
          ...p,
          ok: false,
          message: e?.message || 'Нет доступа к геолокации',
          updatedAt: Date.now(),
        }))
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    )
  }

  async function refreshGPSOnce() {
    setErr(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps((p) => ({ ...p, ok: false, message: 'Геолокация недоступна' }))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: Date.now(),
          message: null,
        })
      },
      (e) => {
        setGps((p) => ({
          ...p,
          ok: false,
          message: e?.message || 'Нет доступа к геолокации',
          updatedAt: Date.now(),
        }))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
    )
  }

  useEffect(() => {
    refreshSession()
    const sub = supabase.auth.onAuthStateChange(() => refreshSession())
    return () => sub.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) {
      stopWatch()
      return
    }
    startWatch()
    return () => stopWatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!userId) return
    loadWorkerData(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function onLogin() {
    setErr(null)
    if (!canLogin) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      popToast('Вход выполнен')
      setEmail('')
      setPassword('')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    try {
      await supabase.auth.signOut()
      stopWatch()
      popToast('Вышел')
    } finally {
      setBusy(false)
    }
  }

  function startEligibility(job: Job) {
    const site = job.sites || null
    if (!site) return { ok: false, reason: 'Нет объекта (site)' }
    if (site.lat == null || site.lng == null) return { ok: false, reason: 'Запрещено: нет lat/lng' }
    if (!gps.ok || gps.lat == null || gps.lng == null || gps.accuracy == null) return { ok: false, reason: 'Нет GPS' }
    if (gps.accuracy > 80) return { ok: false, reason: `GPS accuracy > 80м (${Math.round(gps.accuracy)}м)` }
    const dist = haversineMeters(gps.lat, gps.lng, site.lat, site.lng)
    const radius = site.radius ?? 0
    if (radius <= 0) return { ok: false, reason: 'Радиус не задан' }
    if (dist > radius) return { ok: false, reason: `Ты вне радиуса (${Math.round(dist)}м > ${radius}м)` }
    return { ok: true, dist, radius }
  }

  async function onStart(job: Job) {
    if (!userId) return
    setErr(null)

    const check = startEligibility(job)
    if (!check.ok) {
      setErr(check.reason)
      return
    }

    setBusy(true)
    try {
      const now = new Date().toISOString()

      const { error: insErr } = await supabase.from('time_logs').insert({
        job_id: job.id,
        worker_id: userId,
        start_at: now,
        start_lat: gps.lat,
        start_lng: gps.lng,
        start_accuracy: gps.accuracy,
      })

      if (insErr) throw insErr

      const { error: updErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', job.id)
      if (updErr) throw updErr

      popToast('START')
      await loadWorkerData(userId)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка START')
    } finally {
      setBusy(false)
    }
  }

  async function onStop(job: Job) {
    if (!userId) return
    setErr(null)

    const log = activeLogs[job.id]
    if (!log) {
      setErr('Нет активного time_log для STOP')
      return
    }

    if (!gps.ok || gps.lat == null || gps.lng == null || gps.accuracy == null) {
      setErr('Нет GPS для STOP')
      return
    }
    if (gps.accuracy > 80) {
      setErr(`GPS accuracy > 80м (${Math.round(gps.accuracy)}м)`)
      return
    }

    setBusy(true)
    try {
      const now = new Date().toISOString()

      const { error: updLogErr } = await supabase
        .from('time_logs')
        .update({
          stop_at: now,
          stop_lat: gps.lat,
          stop_lng: gps.lng,
          stop_accuracy: gps.accuracy,
        })
        .eq('id', log.id)

      if (updLogErr) throw updLogErr

      const { error: updJobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', job.id)
      if (updJobErr) throw updJobErr

      popToast('STOP')
      await loadWorkerData(userId)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка STOP')
    } finally {
      setBusy(false)
    }
  }

  const gpsBadge = useMemo(() => {
    if (!gps.updatedAt) return { text: 'GPS: —', tone: 'zinc' as const }
    if (!gps.ok) return { text: `GPS: нет доступа`, tone: 'red' as const }
    return { text: `GPS: ok • acc ${Math.round(gps.accuracy || 0)}м`, tone: (gps.accuracy || 999) <= 80 ? 'green' : 'amber' as const }
  }, [gps])

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="rounded-3xl border border-amber-400/20 bg-gradient-to-b from-[#0b0b12] to-[#07070b] p-6 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <img src="/tanija-logo.png" alt="Tanija" className="h-11 w-11 rounded-2xl" />
              <div>
                <div className="text-2xl font-semibold tracking-tight text-amber-200">Cleaning Timeclock</div>
                <div className="text-sm text-zinc-500">Tanija</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  'inline-flex rounded-full border px-3 py-1 text-xs font-semibold',
                  gpsBadge.tone === 'green'
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                    : gpsBadge.tone === 'amber'
                    ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                    : gpsBadge.tone === 'red'
                    ? 'border-red-400/20 bg-red-500/10 text-red-200'
                    : 'border-zinc-700/60 bg-black/30 text-zinc-200',
                ].join(' ')}
              >
                {gpsBadge.text}
              </span>

              <button
                onClick={refreshGPSOnce}
                disabled={busy}
                className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
              >
                Обновить GPS
              </button>

              {userId ? (
                <button
                  onClick={onLogout}
                  disabled={busy}
                  className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
                >
                  Выйти
                </button>
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
            <div className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-300/5 px-4 py-3 text-sm text-zinc-300">
              Загрузка…
            </div>
          ) : userId ? (
            <div className="mt-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="rounded-2xl border border-amber-400/15 bg-amber-300/5 px-4 py-3">
                  <div className="text-sm text-zinc-400">Ты вошёл как</div>
                  <div className="font-semibold text-zinc-100">{sessionEmail}</div>
                  <div className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                    {role || '—'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {role === 'admin' ? (
                    <a
                      href="/admin"
                      className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/15"
                    >
                      Открыть /admin
                    </a>
                  ) : null}

                  <button
                    onClick={async () => {
                      if (!userId) return
                      setBusy(true)
                      try {
                        await loadWorkerData(userId)
                        popToast('Данные обновлены')
                      } finally {
                        setBusy(false)
                      }
                    }}
                    disabled={busy}
                    className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                  >
                    {busy ? 'Обновляю…' : 'Обновить данные'}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {(['all', 'planned', 'in_progress', 'done'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={[
                      'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                      filter === s
                        ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                        : 'border-zinc-700/60 bg-black/30 text-zinc-200 hover:bg-black/40',
                    ].join(' ')}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {filteredJobs.map((j) => {
                  const site = j.sites || null
                  const dt = formatDMY(j.job_date)
                  const tm = normalizeTime(j.scheduled_time)
                  const active = !!activeLogs[j.id]

                  const eligibility = j.status === 'planned' ? startEligibility(j) : null

                  let distanceInfo: string | null = null
                  if (site?.lat != null && site?.lng != null && gps.ok && gps.lat != null && gps.lng != null) {
                    const d = haversineMeters(gps.lat, gps.lng, site.lat, site.lng)
                    distanceInfo = `dist ${Math.round(d)}м`
                  }

                  return (
                    <div key={j.id} className="rounded-3xl border border-zinc-800/80 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-semibold text-zinc-100">
                            {dt}
                            {tm ? ` ${tm}` : ''}
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {site ? `${site.name} — ${site.address}` : `site_id: ${j.site_id}`}
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
                              <span className="inline-flex rounded-full border border-zinc-700/60 bg-black/30 px-3 py-1 text-xs font-semibold text-zinc-200">
                                радиус {site.radius ?? 0}м
                              </span>
                            ) : null}

                            {distanceInfo ? (
                              <span className="inline-flex rounded-full border border-zinc-700/60 bg-black/30 px-3 py-1 text-xs font-semibold text-zinc-200">
                                {distanceInfo}
                              </span>
                            ) : null}

                            {active ? (
                              <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                                active
                              </span>
                            ) : null}
                          </div>

                          {active ? (
                            <div className="mt-2 text-sm text-zinc-400">
                              START: {formatDT(activeLogs[j.id].start_at)}
                            </div>
                          ) : null}

                          {j.status === 'planned' && eligibility && !eligibility.ok ? (
                            <div className="mt-2 text-sm text-zinc-400">START: {eligibility.reason}</div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {j.status === 'planned' ? (
                            <button
                              onClick={() => onStart(j)}
                              disabled={busy || !(eligibility && eligibility.ok)}
                              className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                            >
                              START
                            </button>
                          ) : null}

                          {j.status === 'in_progress' ? (
                            <button
                              onClick={() => onStop(j)}
                              disabled={busy || !active}
                              className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-50"
                            >
                              STOP
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {filteredJobs.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800/80 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                    Задач нет
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <label className="block text-sm text-zinc-300">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                autoComplete="email"
                inputMode="email"
              />

              <label className="block text-sm text-zinc-300">Пароль</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                autoComplete="current-password"
              />

              <button
                onClick={onLogin}
                disabled={busy || !canLogin}
                className="mt-2 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
              >
                {busy ? 'Вхожу…' : 'Войти'}
              </button>

              <a
                href="/forgot-password"
                className="block text-center text-sm text-zinc-400 underline decoration-amber-300/40 underline-offset-4 hover:text-zinc-200"
              >
                Забыли пароль?
              </a>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-xs text-zinc-500">
          Форматы: <span className="text-zinc-300">ДД-ММ-ГГГГ</span> и <span className="text-zinc-300">ДД-ММ-ГГГГ ЧЧ:ММ</span>
        </div>
      </div>
    </div>
  )
}
