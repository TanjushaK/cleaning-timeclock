'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { clearClientAuthState, getAccessToken } from '@/lib/auth-fetch'

type Participant = {
  worker_id: string
  worker_name: string
  status: string
  started_at: string | null
}

type Item = {
  job_id: string
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time: string | null
  site: { name: string | null; address: string | null } | null
  participants: Participant[]
}

type WorkingRow = {
  job_id: string
  job_date: string | null
  site_name: string
  address: string
  worker_id: string
  worker_name: string
  started_at: string | null
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toDateInput(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
}

function toLocalDateTimeInput(value: Date) {
  return `${toDateInput(value)}T${pad2(value.getHours())}:${pad2(value.getMinutes())}`
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export default function TimeLogRepairPage() {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])
  const [dateFrom, setDateFrom] = useState(toDateInput(today))
  const [dateTo, setDateTo] = useState(toDateInput(today))
  const [rows, setRows] = useState<WorkingRow[]>([])
  const [stopValues, setStopValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/admin')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      const response = await fetch(`/api/admin/workforce-map?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (response.status === 401) {
        clearClientAuthState()
        router.replace('/admin')
        return
      }
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)

      const nextRows: WorkingRow[] = []
      for (const item of (body?.items || []) as Item[]) {
        for (const participant of item.participants || []) {
          if (participant.status !== 'working') continue
          nextRows.push({
            job_id: item.job_id,
            job_date: item.job_date,
            site_name: item.site?.name || 'Объект не указан',
            address: item.site?.address || 'Адрес не указан',
            worker_id: participant.worker_id,
            worker_name: participant.worker_name,
            started_at: participant.started_at,
          })
        }
      }
      setRows(nextRows)
      setStopValues((current) => {
        const next = { ...current }
        const nowValue = toLocalDateTimeInput(new Date())
        for (const row of nextRows) {
          const key = `${row.job_id}:${row.worker_id}`
          if (!next[key]) next[key] = nowValue
        }
        return next
      })
    } catch (caught) {
      setError(String((caught as Error)?.message || caught))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, router])

  useEffect(() => {
    void load()
  }, [load])

  async function forceStop(row: WorkingRow) {
    const token = getAccessToken()
    if (!token) return
    const key = `${row.job_id}:${row.worker_id}`
    const localValue = stopValues[key]
    if (!localValue) {
      setError('Укажите фактическое время завершения')
      return
    }

    const stoppedAt = new Date(localValue)
    if (Number.isNaN(stoppedAt.getTime())) {
      setError('Некорректное время завершения')
      return
    }

    if (!window.confirm(`Закрыть открытые часы работника ${row.worker_name} временем ${localValue.replace('T', ' ')}?`)) return

    setBusyKey(key)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/time-logs/force-stop', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: row.job_id,
          worker_id: row.worker_id,
          stopped_at: stoppedAt.toISOString(),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
      setMessage(`Закрыто записей: ${body?.closed_logs ?? 0}. ${row.worker_name} больше не должен отображаться работающим.`)
      await load()
    } catch (caught) {
      setError(String((caught as Error)?.message || caught))
    } finally {
      setBusyKey('')
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Зависшие часы</h1>
            <p className="mt-1 text-sm text-zinc-400">Показываются только работники с открытым time log. Закрытие применяется только к выбранному работнику.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push('/admin/workforce-map')} className="rounded-xl border border-yellow-400/25 px-4 py-2 text-sm">Карта смен</button>
            <button onClick={() => router.push('/admin')} className="rounded-xl border border-yellow-400/25 px-4 py-2 text-sm">Админка</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 rounded-3xl border border-yellow-400/15 bg-black/30 p-4">
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm" />
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{loading ? 'Проверка…' : 'Обновить'}</button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{message}</div> : null}

        <div className="mt-5 space-y-3">
          {rows.map((row) => {
            const key = `${row.job_id}:${row.worker_id}`
            return (
              <section key={key} className="rounded-3xl border border-emerald-400/25 bg-black/30 p-5">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{row.worker_name}</span>
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100">Работает</span>
                    </div>
                    <div className="mt-2 text-sm">{row.site_name}</div>
                    <div className="mt-1 text-xs text-zinc-400">{row.address}</div>
                    <div className="mt-3 text-xs text-zinc-400">Старт: {formatDateTime(row.started_at)}</div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-400">Фактическое завершение</span>
                      <input
                        type="datetime-local"
                        value={stopValues[key] || ''}
                        onChange={(event) => setStopValues((current) => ({ ...current, [key]: event.target.value }))}
                        className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      onClick={() => void forceStop(row)}
                      disabled={busyKey === key}
                      className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busyKey === key ? 'Закрываю…' : 'Закрыть часы'}
                    </button>
                  </div>
                </div>
              </section>
            )
          })}

          {!loading && rows.length === 0 ? (
            <div className="rounded-3xl border border-zinc-800 bg-black/30 p-8 text-center text-sm text-zinc-400">Открытых time logs в выбранном периоде нет.</div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
