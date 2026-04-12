'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch'

type WorkerRow = {
  id: string
  full_name: string | null
  role: string | null
  active: boolean | null
}

type ReportDay = {
  date: string
  minutes: number
  jobs_count: number
  logged_jobs: number
}

type ReportLog = {
  started_at: string
  stopped_at: string
  minutes: number
}

type ReportCoworker = {
  worker_id: string
  worker_name: string | null
}

type ReportJobDetail = {
  job_id: string
  job_date: string
  scheduled_time: string | null
  scheduled_end_time: string | null
  worker_id: string
  worker_name: string | null
  site_id: string
  site_name: string | null
  minutes: number
  logs: ReportLog[]
  coworkers: ReportCoworker[]
}

type ReportResp = {
  from: string
  to: string
  total_minutes: number
  by_day?: ReportDay[]
  job_details?: ReportJobDetail[]
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  return `${y}-${m}-${dd}`
}

function fmtD(iso?: string | null) {
  if (!iso) return '\u2014'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '\u2014'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

function fmtMinutesHM(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  return `${h}:${pad2(r)}`
}

function weekRangeToday() {
  const d = new Date()
  const day = d.getDay()
  const diffToMon = (day + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: toISODate(mon), to: toISODate(sun) }
}

function monthRangeToday() {
  const d = new Date()
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: toISODate(from), to: toISODate(to) }
}

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export default function AdminHoursPage() {
  const { t } = useI18n()

  const [booting, setBooting] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const initialWeek = useMemo(() => weekRangeToday(), [])
  const [dateFrom, setDateFrom] = useState(initialWeek.from)
  const [dateTo, setDateTo] = useState(initialWeek.to)

  const dateFromRef = useRef<HTMLInputElement | null>(null)
  const dateToRef = useRef<HTMLInputElement | null>(null)

  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [workerId, setWorkerId] = useState('')

  const [data, setData] = useState<ReportResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [prefillDone, setPrefillDone] = useState(false)

  const authed = !!token

  const loadWorkers = useCallback(async () => {
    const res = await authFetchJson<{ workers: WorkerRow[] }>('/api/admin/workers/list', { cache: 'no-store' })
    const list = Array.isArray(res?.workers) ? res.workers : []
    const filtered = list
      .filter((w) => String(w.role || '') === 'worker')
      .filter((w) => w.active !== false)
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
    setWorkers(filtered)
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      if (!workerId) throw new Error(t('admin.hours.errPickWorker'))
      const url = `/api/admin/reports?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}&worker_id=${encodeURIComponent(
        workerId,
      )}&by_day=1`
      const res = await authFetchJson<ReportResp>(url, { cache: 'no-store' })
      setData(res)
    } catch (e: unknown) {
      setData(null)
      setError(String((e as { message?: string })?.message || e || t('admin.hours.errorLoad')))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, workerId, t])

  useEffect(() => {
    if (prefillDone) return
    if (typeof window === 'undefined') return
    const qs = new URLSearchParams(window.location.search)
    const wf = (qs.get('worker_id') || qs.get('workerId') || '').trim()
    const f = (qs.get('from') || '').trim()
    const tt = (qs.get('to') || '').trim()

    if (wf) setWorkerId(wf)
    if (isISODate(f)) setDateFrom(f)
    if (isISODate(tt)) setDateTo(tt)
    setPrefillDone(true)
  }, [prefillDone])

  useEffect(() => {
    ;(async () => {
      try {
        const tok = getAccessToken()
        setToken(tok)
        if (tok) {
          await loadWorkers()
        }
      } catch (e: unknown) {
        const msg = String((e as { message?: string })?.message || e || t('admin.common.errorGeneric'))
        if (msg.includes('401') || /token|unauthorized/i.test(msg)) {
          clearAuthTokens()
          setToken(null)
        } else {
          setError(msg)
        }
      } finally {
        setBooting(false)
      }
    })()
  }, [loadWorkers, t])

  useEffect(() => {
    if (!authed) return
    if (!prefillDone) return
    if (!workerId) return
    if (!isISODate(dateFrom) || !isISODate(dateTo)) return
    if (data) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, prefillDone, workerId])

  const doLogin = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((payload as { error?: string })?.error || `HTTP ${res.status}`))
      setAuthTokens((payload as { access_token: string }).access_token, (payload as { refresh_token?: string }).refresh_token || null)
      const tok = getAccessToken()
      setToken(tok)
      await loadWorkers()
      setNotice(t('admin.common.noticeLogin'))
    } catch (e: unknown) {
      setError(String((e as { message?: string })?.message || e || t('admin.common.errorLogin')))
    } finally {
      setBusy(false)
      setBooting(false)
    }
  }, [email, password, loadWorkers, t])

  const doLogout = useCallback(() => {
    clearAuthTokens()
    setToken(null)
    setWorkers([])
    setWorkerId('')
    setData(null)
    setNotice(t('admin.common.noticeLogout'))
  }, [t])

  if (booting) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center">
        <div className="text-sm opacity-80">{t('admin.common.loading')}</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
          <div className="text-xl font-semibold">{t('admin.hours.title')}</div>
          <div className="text-sm opacity-80 mt-1">{t('admin.hours.subtitleLogin')}</div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('admin.common.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('admin.common.passwordPlaceholder')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
              onClick={doLogin}
              disabled={busy || !email.trim() || !password.trim()}
            >
              {busy ? t('admin.common.signingIn') : t('admin.common.signIn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const workerName = workers.find((w) => w.id === workerId)?.full_name || t('admin.common.dash')

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">{t('admin.hours.title')}</div>
            <div className="text-sm opacity-80 mt-1">{t('admin.hours.subtitle')}</div>
          </div>

          <div className="flex gap-2">
            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
              {t('admin.common.adminHome')}
            </a>
            <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout}>
              {t('admin.common.logout')}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs opacity-80">{t('admin.hours.worker')}</span>
            <select
              value={workerId}
              onChange={(e) => {
                setWorkerId(e.target.value)
                setData(null)
              }}
              className="w-[320px] max-w-full rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
            >
              <option value="">{t('admin.hours.pickWorker')}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || w.id}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs opacity-80">{t('admin.hours.dateFrom')}</span>
            <div className="flex items-center gap-2">
              <input
                ref={dateFromRef}
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setData(null)
                }}
                className="rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              />
              <button
                type="button"
                onClick={() => {
                  const el = dateFromRef.current as HTMLInputElement & { showPicker?: () => void }
                  if (el?.showPicker) el.showPicker()
                  else dateFromRef.current?.focus()
                }}
                className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
                aria-label={t('admin.hours.openCalendar')}
                title={t('admin.hours.calendarTitle')}
              >
                📅
              </button>
            </div>
          </label>
          <label className="grid gap-1">
            <span className="text-xs opacity-80">{t('admin.hours.dateTo')}</span>
            <div className="flex items-center gap-2">
              <input
                ref={dateToRef}
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setData(null)
                }}
                className="rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              />
              <button
                type="button"
                onClick={() => {
                  const el = dateToRef.current as HTMLInputElement & { showPicker?: () => void }
                  if (el?.showPicker) el.showPicker()
                  else dateToRef.current?.focus()
                }}
                className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
                aria-label={t('admin.hours.openCalendar')}
                title={t('admin.hours.calendarTitle')}
              >
                📅
              </button>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date()
                const iso = toISODate(d)
                setDateFrom(iso)
                setDateTo(iso)
                setData(null)
              }}
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
            >
              {t('admin.hours.day')}
            </button>
            <button
              type="button"
              onClick={() => {
                const w = weekRangeToday()
                setDateFrom(w.from)
                setDateTo(w.to)
                setData(null)
              }}
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
            >
              {t('admin.hours.week')}
            </button>
            <button
              type="button"
              onClick={() => {
                const m = monthRangeToday()
                setDateFrom(m.from)
                setDateTo(m.to)
                setData(null)
              }}
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
            >
              {t('admin.hours.month')}
            </button>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
          >
            {loading ? t('admin.hours.calculating') : t('admin.hours.show')}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4">
            <div className="text-xs opacity-80">{t('admin.hours.periodTotal')}</div>
            <div className="mt-1 text-3xl font-semibold">{fmtMinutesHM(data?.total_minutes ?? 0)}</div>
            <div className="mt-1 text-xs opacity-70">{workerName}</div>
            <div className="mt-1 text-xs opacity-70">
              {fmtD(dateFrom)} — {fmtD(dateTo)}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 overflow-hidden">
            <div className="border-b border-amber-500/10 bg-black/20 px-4 py-3 text-xs text-zinc-200">{t('admin.hours.byDay')}</div>
            {!data?.by_day?.length ? (
              <div className="px-4 py-6 text-sm opacity-70">{t('admin.common.dash')}</div>
            ) : (
              data.by_day.map((d) => (
                <div key={d.date} className="grid grid-cols-12 items-center gap-0 border-t border-amber-500/10 px-4 py-3 text-sm">
                  <div className="col-span-3 opacity-90">{fmtD(d.date)}</div>
                  <div className="col-span-3 text-xs opacity-80">
                    {t('admin.hours.jobsCount', { n: d.jobs_count })}
                  </div>
                  <div className="col-span-3 text-xs opacity-80">
                    {t('admin.hours.loggedCount', { n: d.logged_jobs })}
                  </div>
                  <div className="col-span-3 text-right font-semibold">{fmtMinutesHM(d.minutes)}</div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 overflow-hidden">
            <div className="border-b border-amber-500/10 bg-black/20 px-4 py-3 text-xs text-zinc-200">{t('admin.hours.byJobs')}</div>
            {!data?.job_details?.length ? (
              <div className="px-4 py-6 text-sm opacity-70">{t('admin.common.dash')}</div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="min-w-[960px] w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-300">
                      <th className="px-4 py-3">{t('admin.hours.thDate')}</th>
                      <th className="px-4 py-3">{t('admin.hours.thTime')}</th>
                      <th className="px-4 py-3">{t('admin.hours.thSite')}</th>
                      <th className="px-4 py-3">{t('admin.hours.thWith')}</th>
                      <th className="px-4 py-3">{t('admin.hours.thLogs')}</th>
                      <th className="px-4 py-3 text-right">{t('admin.hours.thTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.job_details.map((j) => (
                      <tr key={j.job_id} className="border-t border-amber-500/10">
                        <td className="px-4 py-3 whitespace-nowrap">{fmtD(j.job_date)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {j.scheduled_time ? j.scheduled_time.slice(0, 5) : t('admin.common.dash')}
                          {j.scheduled_end_time ? `–${j.scheduled_end_time.slice(0, 5)}` : ''}
                        </td>
                        <td className="px-4 py-3">{j.site_name || j.site_id}</td>
                        <td className="px-4 py-3">
                          {!j.coworkers?.length ? t('admin.common.dash') : j.coworkers.map((c) => c.worker_name || c.worker_id).join(', ')}
                        </td>
                        <td className="px-4 py-3">
                          {!j.logs?.length
                            ? t('admin.common.dash')
                            : j.logs
                                .map((l) => {
                                  const st = new Date(l.started_at)
                                  const sp = new Date(l.stopped_at)
                                  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                                  return `${hhmm(st)}–${hhmm(sp)} (${fmtMinutesHM(l.minutes)})`
                                })
                                .join(' · ')}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{fmtMinutesHM(j.minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
