// app/page.tsx
'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type JobStatus = 'planned' | 'in_progress' | 'done'

type Job = {
  id: string
  status: JobStatus
  job_date?: string | null
  scheduled_time?: string | null
  scheduled_at?: string | null
  site_id?: string | null
  site_name?: string | null
  site?: {
    name?: string | null
    radius?: number | null
    lat?: number | null
    lng?: number | null
  } | null
  started_at?: string | null
  stopped_at?: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtDT(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  const hh = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`
}

function fmtD(v?: string | null) {
  if (!v) return '—'
  // если это YYYY-MM-DD, парсим вручную
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = pad2(d.getDate())
  const mm = pad2(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

async function getGPS(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return await new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Геолокация недоступна на этом устройстве'))
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
      (err) => reject(new Error(err.message || 'Не удалось получить геолокацию')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}

export default function WorkerHomePage() {
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)

  const [tab, setTab] = useState<JobStatus>('planned')

  const filtered = useMemo(() => jobs.filter((j) => (j.status || 'planned') === tab), [jobs, tab])

  async function refreshJobs(token: string) {
    setJobsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/me/jobs', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })

      if (res.status === 401) {
        await supabase.auth.signOut()
        setSessionToken(null)
        setJobs([])
        setError(null)
        return
      }

      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        setError(data?.error || 'Не удалось загрузить смены')
        return
      }

      const list = (data?.jobs ?? data) as Job[]
      setJobs(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.message || 'Ошибка сети')
    } finally {
      setJobsLoading(false)
    }
  }

  async function boot() {
    setSessionLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token ?? null
      setSessionToken(token)

      if (token) {
        await refreshJobs(token)
      }
    } finally {
      setSessionLoading(false)
    }
  }

  useEffect(() => {
    void boot()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const token = newSession?.access_token ?? null
      setSessionToken(token)
      setError(null)

      if (token) {
        await refreshJobs(token)
      } else {
        setJobs([])
      }
    })

    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message || 'Ошибка входа')
        return
      }
      // дальнейшая загрузка произойдёт через onAuthStateChange
    } catch (e: any) {
      setError(e?.message || 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      await supabase.auth.signOut()
      setSessionToken(null)
      setJobs([])
    } finally {
      setBusy(false)
    }
  }

  async function postJobAction(path: string, jobId: string) {
    if (!sessionToken) return
    setBusy(true)
    setError(null)
    try {
      const gps = await getGPS()
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          job_id: jobId,
          lat: gps.lat,
          lng: gps.lng,
          accuracy: gps.accuracy,
        }),
      })

      const data = await res.json().catch(() => ({} as any))

      if (res.status === 401) {
        await supabase.auth.signOut()
        setSessionToken(null)
        setJobs([])
        return
      }

      if (!res.ok) {
        setError(data?.error || 'Операция не выполнена')
        return
      }

      await refreshJobs(sessionToken)
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const headerRight = (
    <div className="flex items-center gap-2">
      {sessionToken ? (
        <>
          <button
            onClick={() => sessionToken && refreshJobs(sessionToken)}
            disabled={busy || jobsLoading}
            className="rounded-xl border border-yellow-400/40 bg-black/40 px-4 py-2 text-sm text-yellow-100 transition hover:border-yellow-300/70 hover:bg-black/60 disabled:opacity-60"
          >
            {jobsLoading ? 'Обновляю…' : 'Обновить'}
          </button>
          <button
            onClick={onLogout}
            disabled={busy}
            className="rounded-xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-sm text-yellow-100/90 transition hover:border-yellow-300/60 hover:bg-black/50 disabled:opacity-60"
          >
            Выйти
          </button>
        </>
      ) : null}
    </div>
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/40 shadow-[0_0_0_1px_rgba(255,215,0,0.12)]">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-2" priority />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">Cleaning Timeclock</div>
              <div className="text-xs text-yellow-200/70">Tanija • worker console</div>
            </div>
          </div>
          {headerRight}
        </div>

        <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          {sessionLoading ? (
            <div className="text-sm text-zinc-300">Проверяю сессию…</div>
          ) : !sessionToken ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h1 className="text-xl font-semibold text-yellow-100">Вход</h1>
                <p className="mt-2 text-sm text-zinc-300">
                  Без токена не истерим — просто логинимся и работаем.
                </p>

                {error ? (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}

                <form onSubmit={onLogin} className="mt-5 grid gap-3">
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-300">Email</span>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      autoComplete="email"
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none ring-0 transition focus:border-yellow-300/60"
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
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none ring-0 transition focus:border-yellow-300/60"
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-2 rounded-2xl border border-yellow-300/40 bg-gradient-to-r from-yellow-500/10 via-yellow-400/10 to-yellow-300/10 px-4 py-3 text-sm font-semibold text-yellow-100 shadow-[0_0_0_1px_rgba(255,215,0,0.18)] transition hover:border-yellow-200/70 hover:bg-yellow-400/10 disabled:opacity-60"
                  >
                    {busy ? 'Вхожу…' : 'Войти'}
                  </button>
                </form>
              </div>

              <div className="rounded-3xl border border-yellow-400/15 bg-black/30 p-5">
                <div className="text-sm font-semibold text-yellow-100">Как это работает</div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-300">
                  <li>После входа загрузятся смены.</li>
                  <li>START/STOP требуют GPS и точность (обычно ≤ 80м).</li>
                  <li>Если объект без lat/lng — старт будет запрещён сервером.</li>
                </ul>
                <div className="mt-5 rounded-2xl border border-yellow-400/15 bg-zinc-950/40 p-4 text-xs text-zinc-300">
                  Совет: включи геолокацию + high accuracy, иначе будет «мимо радиуса».
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-yellow-100">Мои смены</h1>
                  <div className="mt-1 text-xs text-zinc-300">Формат времени: ДД-ММ-ГГГГ ЧЧ:ММ</div>
                </div>

                <div className="flex items-center gap-2">
                  {(['planned', 'in_progress', 'done'] as JobStatus[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={[
                        'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                        tab === t
                          ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                          : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40',
                      ].join(' ')}
                    >
                      {t === 'planned' ? 'Planned' : t === 'in_progress' ? 'In progress' : 'Done'}
                    </button>
                  ))}
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                {jobsLoading ? (
                  <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-4 text-sm text-zinc-300">
                    Загружаю…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-4 text-sm text-zinc-300">
                    Нет смен в этом статусе.
                  </div>
                ) : (
                  filtered.map((j) => {
                    const siteName = j.site?.name || j.site_name || 'Объект'
                    const when =
                      j.scheduled_at
                        ? fmtDT(j.scheduled_at)
                        : j.job_date
                          ? `${fmtD(j.job_date)}${j.scheduled_time ? ` ${j.scheduled_time.slice(0, 5)}` : ''}`
                          : '—'

                    return (
                      <div
                        key={j.id}
                        className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5 shadow-[0_0_0_1px_rgba(255,215,0,0.08)] transition hover:border-yellow-300/30"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-yellow-100">{siteName}</div>
                            <div className="mt-1 text-xs text-zinc-300">
                              План: <span className="text-zinc-100">{when}</span>
                            </div>
                            {j.started_at ? (
                              <div className="mt-1 text-xs text-zinc-300">
                                Start: <span className="text-zinc-100">{fmtDT(j.started_at)}</span>
                              </div>
                            ) : null}
                            {j.stopped_at ? (
                              <div className="mt-1 text-xs text-zinc-300">
                                Stop: <span className="text-zinc-100">{fmtDT(j.stopped_at)}</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            {j.status === 'planned' ? (
                              <button
                                disabled={busy}
                                onClick={() => postJobAction('/api/me/jobs/start', j.id)}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                              >
                                START
                              </button>
                            ) : null}

                            {j.status === 'in_progress' ? (
                              <button
                                disabled={busy}
                                onClick={() => postJobAction('/api/me/jobs/stop', j.id)}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                              >
                                STOP
                              </button>
                            ) : null}

                            <div className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-[11px] text-zinc-200">
                              {j.status === 'planned'
                                ? 'PLANNED'
                                : j.status === 'in_progress'
                                  ? 'IN PROGRESS'
                                  : 'DONE'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} Tanija • dark & gold, без лишней драмы
        </div>
      </div>
    </main>
  )
}
