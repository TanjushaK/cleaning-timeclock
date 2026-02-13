'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetchJson } from '@/lib/auth-fetch'

type UserLite = {
  id: string
  email: string | null
}

type SiteRow = {
  id: string
  name: string | null
  lat: number | null
  lng: number | null
  radius: number | null
}

type JobRow = {
  id: string
  title: string | null
  job_date: string | null
  scheduled_time: string | null
  status: string | null
  site: SiteRow | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatDateRu(iso?: string | null) {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

function timeHHMM(v?: string | null) {
  if (!v) return '—'
  const m = /^(\d{2}):(\d{2})/.exec(v)
  if (m) return `${m[1]}:${m[2]}`
  return v
}

function statusRu(s?: string | null) {
  switch (s) {
    case 'planned':
      return 'Запланировано'
    case 'in_progress':
      return 'В процессе'
    case 'done':
      return 'Завершено'
    case 'cancelled':
      return 'Отменено'
    default:
      return s || '—'
  }
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

async function getGeoPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return await new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Геолокация не поддерживается.'))
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
      (err) => {
        reject(new Error(err?.message || 'Не удалось получить геолокацию.'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

export default function HomePage() {
  const [user, setUser] = useState<UserLite | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [jobs, setJobs] = useState<JobRow[]>([])
  const [filter, setFilter] = useState<'planned' | 'in_progress' | 'done' | 'cancelled'>('planned')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c = { planned: 0, in_progress: 0, done: 0, cancelled: 0 }
    for (const j of jobs) {
      const st = (j.status || 'planned') as keyof typeof c
      if (st in c) c[st]++
    }
    return c
  }, [jobs])

  const jobsFiltered = useMemo(() => {
    return jobs
      .filter((j) => (j.status || 'planned') === filter)
      .sort((a, b) => {
        const da = (a.job_date || '') + ' ' + timeHHMM(a.scheduled_time)
        const db = (b.job_date || '') + ' ' + timeHHMM(b.scheduled_time)
        return da.localeCompare(db)
      })
  }, [jobs, filter])

  async function loadUser() {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      setUser(null)
      return
    }
    const u = data?.user
    if (!u) {
      setUser(null)
      return
    }
    setUser({ id: u.id, email: u.email ?? null })
  }

  async function loadJobs(force = false) {
    if (!force && !user) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetchJson<{ jobs: JobRow[] }>('/api/me/jobs')
      setJobs(Array.isArray(res?.jobs) ? res.jobs : [])
    } catch (e: any) {
      const msg = e?.message || 'Не удалось загрузить смены.'
      // Если сессии нет — возвращаем на логин
      if (String(msg).toLowerCase().includes('нужно войти') || String(msg).includes('401')) {
        setUser(null)
        setJobs([])
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUser()
    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadUser()
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user?.id) void loadJobs(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error

      setInfo('Вход выполнен. Загружаю смены…')
      await loadUser()
      await loadJobs(true)
    } catch (e: any) {
      setError(e?.message || 'Не удалось войти.')
    } finally {
      setLoading(false)
    }
  }

  async function onLogout() {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      await supabase.auth.signOut()
      setUser(null)
      setJobs([])
    } catch (e: any) {
      setError(e?.message || 'Не удалось выйти.')
    } finally {
      setLoading(false)
    }
  }

  async function startJob(j: JobRow) {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const pos = await getGeoPosition()

      if (pos.accuracy > 80) {
        throw new Error(`Слишком низкая точность GPS: ${Math.round(pos.accuracy)} м (нужно ≤ 80 м).`)
      }

      if (j.site?.lat == null || j.site?.lng == null) {
        throw new Error('У объекта нет координат. Старт запрещён.')
      }

      const radius = j.site.radius
      if (radius != null && radius > 0) {
        const dist = haversineMeters(pos.lat, pos.lng, j.site.lat, j.site.lng)
        if (dist > radius) {
          throw new Error(`Вы далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).`)
        }
      }

      await authFetchJson('/api/me/jobs/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: j.id, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy }),
      })

      setInfo('Начало работы сохранено.')
      setFilter('in_progress')
      await loadJobs(true)
    } catch (e: any) {
      setError(e?.message || 'Не удалось начать смену.')
    } finally {
      setLoading(false)
    }
  }

  async function stopJob(j: JobRow) {
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const pos = await getGeoPosition()

      if (pos.accuracy > 80) {
        throw new Error(`Слишком низкая точность GPS: ${Math.round(pos.accuracy)} м (нужно ≤ 80 м).`)
      }

      if (j.site?.lat == null || j.site?.lng == null) {
        throw new Error('У объекта нет координат. Стоп запрещён.')
      }

      const radius = j.site.radius
      if (radius != null && radius > 0) {
        const dist = haversineMeters(pos.lat, pos.lng, j.site.lat, j.site.lng)
        if (dist > radius) {
          throw new Error(`Вы далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).`)
        }
      }

      await authFetchJson('/api/me/jobs/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: j.id, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy }),
      })

      setInfo('Конец смены сохранён.')
      setFilter('done')
      await loadJobs(true)
    } catch (e: any) {
      setError(e?.message || 'Не удалось завершить смену.')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/40 shadow-[0_0_0_1px_rgba(255,215,0,0.12)]">
                <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-2" priority />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-wide">Cleaning Timeclock</div>
                <div className="text-xs text-yellow-200/70">Tanija • кабинет работника</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
            <h1 className="text-xl font-semibold text-yellow-100">Вход</h1>
            <div className="mt-1 text-sm text-zinc-300">Только для сотрудников.</div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}

            {info ? (
              <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-black/30 px-4 py-3 text-sm text-yellow-100">{info}</div>
            ) : null}

            <form onSubmit={onLogin} className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="you@domain.com"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">Пароль</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="••••••••"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-2xl border border-yellow-300/40 bg-gradient-to-r from-yellow-500/10 via-yellow-400/10 to-yellow-300/10 px-4 py-3 text-sm font-semibold text-yellow-100 shadow-[0_0_0_1px_rgba(255,215,0,0.18)] transition hover:border-yellow-200/70 hover:bg-yellow-400/10 disabled:opacity-60"
              >
                {loading ? 'Вхожу…' : 'Войти'}
              </button>

              <div className="mt-2 text-center text-xs text-zinc-400">
                <Link href="/forgot-password" className="text-yellow-200/80 hover:text-yellow-200">
                  Забыли пароль?
                </Link>
              </div>
            </form>
          </div>

          <div className="mt-6 text-center text-xs text-zinc-500">© 2026 Tanija • dark &amp; gold, без лишней драмы</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/40 shadow-[0_0_0_1px_rgba(255,215,0,0.12)]">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-2" priority />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">Cleaning Timeclock</div>
              <div className="text-xs text-yellow-200/70">{user.email || 'сотрудник'}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadJobs(true)}
              disabled={loading}
              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40 disabled:opacity-60"
            >
              Обновить
            </button>
            <button
              onClick={onLogout}
              disabled={loading}
              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40 disabled:opacity-60"
            >
              Выйти
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
        ) : null}

        {info ? (
          <div className="mb-4 rounded-2xl border border-yellow-400/20 bg-black/30 px-4 py-3 text-sm text-yellow-100">{info}</div>
        ) : null}

        <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('planned')}
              className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
                filter === 'planned'
                  ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100'
                  : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
              }`}
            >
              Запланировано ({counts.planned})
            </button>
            <button
              onClick={() => setFilter('in_progress')}
              className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
                filter === 'in_progress'
                  ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100'
                  : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
              }`}
            >
              В работе ({counts.in_progress})
            </button>
            <button
              onClick={() => setFilter('done')}
              className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
                filter === 'done'
                  ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100'
                  : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
              }`}
            >
              Завершено ({counts.done})
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
                filter === 'cancelled'
                  ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100'
                  : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
              }`}
            >
              Отменено ({counts.cancelled})
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {jobsFiltered.length === 0 ? (
              <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-4 text-sm text-zinc-400">Смен нет</div>
            ) : null}

            {jobsFiltered.map((j) => (
              <div key={j.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-yellow-100">{j.site?.name || j.title || 'Смена'}</div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {formatDateRu(j.job_date)} • {timeHHMM(j.scheduled_time)} • <span className="text-zinc-500">{statusRu(j.status)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">id: {j.id}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {j.status === 'planned' ? (
                      <button
                        onClick={() => void startJob(j)}
                        disabled={loading}
                        className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
                      >
                        СТАРТ
                      </button>
                    ) : null}

                    {j.status === 'in_progress' ? (
                      <button
                        onClick={() => void stopJob(j)}
                        disabled={loading}
                        className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
                      >
                        СТОП
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-zinc-300">
                  Правила: старт/стоп запрещены если нет координат объекта, если точность GPS &gt; 80 м, или если ты дальше радиуса объекта.
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
