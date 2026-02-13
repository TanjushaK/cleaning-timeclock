'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type JobStatus = 'planned' | 'in_progress' | 'done'

type Job = {
  id: string
  job_date: string | null // обычно YYYY-MM-DD
  scheduled_time: string | null // обычно HH:MM:SS
  status: JobStatus
  site_id: string | null
  notes?: string | null
  created_at?: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtRuDateTimeFromISO(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtRuDateFromYMD(ymd?: string | null) {
  if (!ymd) return '—'
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(ymd)
  const yyyy = m[1]
  const mm = m[2]
  const dd = m[3]
  return `${dd}-${mm}-${yyyy}`
}

function fmtTimeHHMM(t?: string | null) {
  if (!t) return '—'
  const s = String(t)
  const m = s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!m) return s
  return `${m[1]}:${m[2]}`
}

function shortId(id?: string | null) {
  if (!id) return '—'
  const s = String(id)
  if (s.length <= 12) return s
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}

function statusRu(s: JobStatus) {
  if (s === 'planned') return 'Запланировано'
  if (s === 'in_progress') return 'В работе'
  return 'Готово'
}

function normalizeApiErrorMessage(msg: string) {
  const m = (msg || '').toLowerCase()
  if (!m) return 'Ошибка'
  if (m.includes('нет токена')) return 'Нужно войти'
  if (m.includes('unauthorized')) return 'Нужно войти'
  if (m.includes('jwt')) return 'Сессия истекла — войди снова'
  return msg
}

export default function WorkerHomePage() {
  const [session, setSession] = useState<Session | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string>('')

  const [lastUpdatedIso, setLastUpdatedIso] = useState<string>('')

  const token = useMemo(() => session?.access_token ?? '', [session])

  async function loadJobs(accessToken: string) {
    setError('')
    setLoading(true)

    try {
      if (!accessToken) throw new Error('Нужно войти')

      const r = await fetch('/api/me/jobs', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        cache: 'no-store',
      })

      const payload = await r.json().catch(() => ({} as any))

      if (!r.ok) {
        const raw = String(payload?.error || payload?.message || `Ошибка API: ${r.status}`)
        const msg = normalizeApiErrorMessage(raw)

        if (r.status === 401) {
          // Сессия/токен умерли — мягко возвращаем на логин
          await supabase.auth.signOut()
          setSession(null)
          setJobs([])
        }

        throw new Error(msg)
      }

      setJobs(Array.isArray(payload?.jobs) ? payload.jobs : [])
      setLastUpdatedIso(new Date().toISOString())
    } catch (e: any) {
      setJobs([])
      const msg = e?.message ? String(e.message) : 'Не смог загрузить смены'
      setError(normalizeApiErrorMessage(msg))
    } finally {
      setLoading(false)
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const em = email.trim().toLowerCase()
      const pw = password

      if (!em || !pw) throw new Error('Введите email и пароль')

      const { data, error: sErr } = await supabase.auth.signInWithPassword({
        email: em,
        password: pw,
      })
      if (sErr) throw new Error(sErr.message)

      const sess = data?.session ?? null
      setSession(sess)

      if (sess?.access_token) {
        await loadJobs(sess.access_token)
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Не смог войти'
      setError(normalizeApiErrorMessage(msg))
    } finally {
      setLoading(false)
    }
  }

  async function doLogout() {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      setSession(null)
      setJobs([])
      setEmail('')
      setPassword('')
      setError('')
      setLastUpdatedIso('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return

      setSession(data.session ?? null)

      if (data.session?.access_token) {
        await loadJobs(data.session.access_token)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.access_token) {
        void loadJobs(newSession.access_token)
      } else {
        setJobs([])
        setLastUpdatedIso('')
      }
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <main className="min-h-screen bg-black text-neutral-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl border border-yellow-700/40 bg-black/40 shadow-sm overflow-hidden flex items-center justify-center">
              <Image src="/tanija-logo.png" alt="Tanija" width={28} height={28} />
            </div>
            <div>
              <div className="text-xl font-semibold tracking-wide">Tanija — Работник</div>
              <div className="text-sm text-neutral-400">Вход • Смены • GPS-таймлог</div>
            </div>
          </div>

          {session ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => token && loadJobs(token)}
                className="rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-4 py-2 text-sm hover:bg-yellow-900/30 disabled:opacity-60"
                disabled={loading || !token}
              >
                Обновить
              </button>
              <button
                onClick={doLogout}
                className="rounded-xl border border-yellow-700/50 bg-black px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
                disabled={loading}
              >
                Выйти
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {!session ? (
          <div className="rounded-2xl border border-yellow-700/40 bg-neutral-950/40 p-5 shadow-sm">
            <div className="mb-3 text-lg font-semibold">Вход</div>

            <form onSubmit={doLogin} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm text-neutral-300">Email</span>
                <input
                  className="rounded-xl border border-yellow-700/30 bg-black px-3 py-2 text-sm outline-none focus:border-yellow-600/60"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm text-neutral-300">Пароль</span>
                <input
                  className="rounded-xl border border-yellow-700/30 bg-black px-3 py-2 text-sm outline-none focus:border-yellow-600/60"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  autoComplete="current-password"
                />
              </label>

              <button
                type="submit"
                className="mt-2 rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-4 py-2 text-sm hover:bg-yellow-900/30 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? 'Вхожу…' : 'Войти'}
              </button>

              <div className="text-xs text-neutral-500">
                Вход только по выданным логину и паролю. Если сессия истекла — просто войди заново.
              </div>
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-yellow-700/40 bg-neutral-950/40 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-semibold">Мои смены</div>
              <div className="text-xs text-neutral-500">
                {lastUpdatedIso ? `Обновлено: ${fmtRuDateTimeFromISO(lastUpdatedIso)}` : ''}
              </div>
            </div>

            {loading ? (
              <div className="rounded-xl border border-yellow-700/20 bg-black/40 px-4 py-3 text-sm text-neutral-300">
                Загружаю…
              </div>
            ) : null}

            {!loading && jobs.length === 0 ? (
              <div className="rounded-xl border border-yellow-700/20 bg-black/40 px-4 py-3 text-sm text-neutral-300">
                Смен пока нет.
              </div>
            ) : null}

            <div className="grid gap-3">
              {jobs.map((j) => {
                const dateRu = fmtRuDateFromYMD(j.job_date)
                const timeRu = fmtTimeHHMM(j.scheduled_time)
                const dt = j.job_date ? `${dateRu}${j.scheduled_time ? ` ${timeRu}` : ''}` : '—'

                return (
                  <div
                    key={j.id}
                    className="rounded-2xl border border-yellow-700/20 bg-black/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-neutral-300">
                        <span className="text-neutral-500">Статус:</span>{' '}
                        <span className="text-yellow-200">{statusRu(j.status)}</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {j.created_at ? `Создано: ${fmtRuDateTimeFromISO(j.created_at)}` : ''}
                      </div>
                    </div>

                    <div className="mt-2 grid gap-1 text-sm">
                      <div>
                        <span className="text-neutral-500">Дата/время:</span>{' '}
                        <span className="text-neutral-100">{dt}</span>
                      </div>

                      <div>
                        <span className="text-neutral-500">Объект:</span>{' '}
                        <span className="text-neutral-100">{shortId(j.site_id)}</span>
                      </div>

                      {j.notes ? (
                        <div className="text-neutral-200">
                          <span className="text-neutral-500">Заметка:</span>{' '}
                          {j.notes}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
