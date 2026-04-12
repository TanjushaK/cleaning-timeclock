'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch'

type ScheduleItem = {
  id: string
  status: string
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time?: string | null
  site_id: string | null
  site_name: string | null
  worker_id: string | null
  worker_name: string | null
  started_at: string | null
  stopped_at: string | null
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
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

function timeHHMM(t?: string | null) {
  if (!t) return null
  const x = String(t)
  return x.length >= 5 ? x.slice(0, 5) : x
}

function minutesFromHHMM(t: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(t)
  if (!m) return null
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function plannedMinutes(from?: string | null, to?: string | null) {
  const f = timeHHMM(from)
  const tt = timeHHMM(to)
  if (!f || !tt) return null
  const a = minutesFromHHMM(f)
  const b = minutesFromHHMM(tt)
  if (a == null || b == null) return null
  let d = b - a
  if (d < 0) d += 24 * 60
  return d
}

function actualMinutes(startISO?: string | null, stopISO?: string | null) {
  if (!startISO || !stopISO) return null
  const a = new Date(startISO).getTime()
  const b = new Date(stopISO).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const diff = Math.max(0, b - a)
  return Math.round(diff / 60000)
}

export default function AdminFactPage() {
  const { t } = useI18n()

  const fmtDur = useMemo(
    () => (mins: number) => {
      const m = Math.max(0, Math.floor(mins || 0))
      const h = Math.floor(m / 60)
      const r = m % 60
      if (h <= 0) return t('admin.fact.durationM', { m: r })
      return t('admin.fact.durationHM', { h, mm: pad2(r) })
    },
    [t],
  )

  const fmtHM = useMemo(
    () => (mins: number) => {
      const m = Math.max(0, Math.floor(mins || 0))
      const h = Math.floor(m / 60)
      const r = m % 60
      return `${h}:${pad2(r)}`
    },
    [],
  )

  const [booting, setBooting] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toISODate(d)
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return toISODate(d)
  })

  const [items, setItems] = useState<ScheduleItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editHM, setEditHM] = useState<Record<string, string>>({})

  const authed = !!token

  const refresh = useCallback(async () => {
    setError(null)
    setNotice(null)
    const url = `/api/admin/schedule?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
    const res = await authFetchJson<{ items: ScheduleItem[] }>(url, { cache: 'no-store' })
    const list = Array.isArray(res?.items) ? res.items : []
    setItems(list)
    const next: Record<string, string> = {}
    for (const j of list) {
      const am = actualMinutes(j.started_at, j.stopped_at)
      if (am != null) next[j.id] = fmtHM(am)
    }
    setEditHM((prev) => ({ ...next, ...prev }))
  }, [dateFrom, dateTo, fmtHM])

  useEffect(() => {
    ;(async () => {
      try {
        const tok = getAccessToken()
        setToken(tok)
        if (tok) await refresh()
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
  }, [refresh, t])

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
      await refresh()
      setNotice(t('admin.common.noticeLogin'))
    } catch (e: unknown) {
      setError(String((e as { message?: string })?.message || e || t('admin.common.errorLogin')))
    } finally {
      setBusy(false)
      setBooting(false)
    }
  }, [email, password, refresh, t])

  const doLogout = useCallback(() => {
    clearAuthTokens()
    setToken(null)
    setItems([])
    setNotice(t('admin.common.noticeLogout'))
  }, [t])

  const doneItems = useMemo(() => {
    return items
      .filter((x) => String(x.status || '') === 'done')
      .sort((a, b) => {
        const da = String(a.job_date || '')
        const db = String(b.job_date || '')
        if (da !== db) return da < db ? 1 : -1
        const ta = String(a.scheduled_time || '')
        const tb = String(b.scheduled_time || '')
        if (ta !== tb) return ta < tb ? 1 : -1
        return String(a.id).localeCompare(String(b.id))
      })
  }, [items])

  const saveFact = useCallback(
    async (jobId: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const hm = String(editHM[jobId] || '').trim()
        const mins = parseHM(hm)
        if (mins == null) throw new Error(t('admin.fact.errFactFormat'))
        await authFetchJson('/api/admin/jobs/set-actual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, hm }),
        })
        setNotice(t('admin.fact.noticeFactUpdated'))
        await refresh()
      } catch (e: unknown) {
        setError(String((e as { message?: string })?.message || e || t('admin.fact.errSave')))
      } finally {
        setBusy(false)
      }
    },
    [editHM, refresh, t],
  )

  const clearActual = useCallback(
    async (jobId: string) => {
      if (!confirm(t('admin.fact.confirmClearHours'))) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await authFetchJson('/api/admin/jobs/clear-actual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId }),
        })
        setEditHM((p) => {
          const n: Record<string, string> = { ...p }
          delete n[jobId]
          return n
        })
        setNotice(t('admin.fact.noticeHoursDeleted'))
        await refresh()
      } catch (e: unknown) {
        setError(String((e as { message?: string })?.message || e || t('admin.fact.errDeleteHours')))
      } finally {
        setBusy(false)
      }
    },
    [refresh, t],
  )

  const deleteJob = useCallback(
    async (jobId: string) => {
      if (!confirm(t('admin.fact.confirmDeleteJob'))) return
      const code = prompt(t('admin.fact.promptDeleteWord'))
      if (String(code || '').trim().toUpperCase() !== 'DELETE') return

      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await authFetchJson(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
          method: 'DELETE',
        })
        setEditHM((p) => {
          const n: Record<string, string> = { ...p }
          delete n[jobId]
          return n
        })
        setNotice(t('admin.fact.noticeJobDeleted'))
        await refresh()
      } catch (e: unknown) {
        setError(String((e as { message?: string })?.message || e || t('admin.fact.errDeleteJob')))
      } finally {
        setBusy(false)
      }
    },
    [refresh, t],
  )

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
          <div className="text-xl font-semibold">{t('admin.fact.title')}</div>
          <div className="text-sm opacity-80 mt-1">{t('admin.fact.subtitleLogin')}</div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {notice}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <input
              id="email"
              name="email"
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('admin.common.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              id="password"
              name="password"
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

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">{t('admin.fact.title')}</div>
            <div className="text-sm opacity-80 mt-1">{t('admin.fact.subtitleMain')}</div>
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
            <span className="text-xs opacity-80">{t('admin.fact.dateFrom')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs opacity-80">{t('admin.fact.dateTo')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
            />
          </label>

          <button
            onClick={async () => {
              setBusy(true)
              setError(null)
              setNotice(null)
              try {
                await refresh()
                setNotice(t('admin.common.noticeUpdated'))
              } catch (e: unknown) {
                setError(String((e as { message?: string })?.message || e || t('admin.fact.errLoad')))
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
            className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
          >
            {busy ? t('admin.common.refreshing') : t('admin.common.refresh')}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 overflow-hidden">
          <div className="grid grid-cols-12 gap-0 border-b border-amber-500/10 bg-black/20 px-4 py-3 text-xs text-zinc-200">
            <div className="col-span-2">{t('admin.fact.theadDate')}</div>
            <div className="col-span-2">{t('admin.fact.theadSite')}</div>
            <div className="col-span-2">{t('admin.fact.theadWorker')}</div>
            <div className="col-span-2">{t('admin.fact.theadPlan')}</div>
            <div className="col-span-1">{t('admin.fact.theadFact')}</div>
            <div className="col-span-3">{t('admin.fact.theadEdit')}</div>
          </div>

          {doneItems.length === 0 ? (
            <div className="px-4 py-6 text-sm opacity-70">{t('admin.fact.emptyDone')}</div>
          ) : (
            doneItems.map((j) => {
              const from = timeHHMM(j.scheduled_time)
              const to = timeHHMM(j.scheduled_end_time ?? null)
              const planM = plannedMinutes(from, to)
              const factM = actualMinutes(j.started_at, j.stopped_at)
              const factStr = factM != null ? fmtDur(factM) : t('admin.common.dash')
              const planStr =
                from && to
                  ? `${from}–${to}${planM != null ? ` • ${fmtDur(planM)}` : ''}`
                  : from || t('admin.common.dash')

              return (
                <div key={j.id} className="grid grid-cols-12 items-center gap-0 border-t border-amber-500/10 px-4 py-3 text-sm">
                  <div className="col-span-2 opacity-90">{fmtD(j.job_date)}</div>
                  <div className="col-span-2 font-semibold">{j.site_name || t('admin.common.dash')}</div>
                  <div className="col-span-2 opacity-90">{j.worker_name || t('admin.common.dash')}</div>
                  <div className="col-span-2 text-xs opacity-80">{planStr}</div>
                  <div className="col-span-1 text-xs opacity-80">{factStr}</div>
                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      value={editHM[j.id] ?? ''}
                      onChange={(e) => setEditHM((p) => ({ ...p, [j.id]: e.target.value }))}
                      placeholder={t('admin.fact.placeholderHM')}
                      className="w-20 rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-xs outline-none focus:border-amber-400/50"
                    />
                    <button
                      onClick={() => saveFact(j.id)}
                      disabled={busy}
                      className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      {t('admin.fact.save')}
                    </button>
                    <button
                      onClick={() => clearActual(j.id)}
                      disabled={busy}
                      title={t('admin.fact.clearHoursTitle')}
                      aria-label={t('admin.fact.clearHoursTitle')}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 hover:bg-red-500/15 disabled:opacity-60"
                    >
                      🗑
                    </button>

                    <button
                      onClick={() => deleteJob(j.id)}
                      disabled={busy}
                      title={t('admin.fact.deleteShiftTitle')}
                      aria-label={t('admin.fact.deleteShiftTitle')}
                      className="rounded-xl border border-zinc-500/30 bg-zinc-900/30 px-3 py-2 text-xs text-zinc-100 hover:bg-zinc-900/50 disabled:opacity-60"
                    >
                      ✖
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="mt-4 text-xs opacity-70">{t('admin.fact.formatHint')}</div>
      </div>
    </div>
  )
}
