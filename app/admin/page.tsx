'use client'
export const dynamic = 'force-dynamic'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Worker = {
  id: string
  role?: 'admin' | 'worker'
  active?: boolean
  email?: string | null
  full_name?: string | null
  [k: string]: any
}

type Site = {
  id: string
  display_name?: string | null
  address?: string | null
  name?: string | null
  radius?: number | null
  radius_m?: number | null
  lat?: number | null
  lng?: number | null
  [k: string]: any
}

type Assignment = {
  site_id: string
  worker_id: string
  created_at?: string
}

const TABS = [
  { key: 'workers', label: 'Работники' },
  { key: 'sites', label: 'Объекты' },
  { key: 'jobs', label: 'Задания' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'reports', label: 'Отчёты' },
  { key: 'settings', label: 'Настройки' },
] as const

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

function prettySiteName(s: Site) {
  return (s.display_name || s.name || s.address || 'Объект без названия').toString()
}

function prettyWorkerName(w: Worker) {
  const base = (w.full_name || w.email || w.id).toString()
  const role = w.role === 'admin' ? ' (админ)' : ''
  const active = w.active === false ? ' (неактивен)' : ''
  return `${base}${role}${active}`
}

function radiusMeters(s: Site): number | null {
  const r = (s.radius ?? s.radius_m) as any
  if (typeof r === 'number' && Number.isFinite(r)) return r
  const n = Number(r)
  return Number.isFinite(n) ? n : null
}

function hasCoords(s: Site) {
  return typeof s.lat === 'number' && typeof s.lng === 'number'
}

async function authedFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Ошибка ${res.status}`)
  return json
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
              Загрузка админки…
            </div>
          </div>
        </div>
      }
    >
      <AdminInner />
    </Suspense>
  )
}

function AdminInner() {
  const sp = useSearchParams()
  const router = useRouter()

  const [tab, setTab] = useState<string>(sp.get('tab') || 'workers')

  const [token, setToken] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>('')

  const [toast, setToast] = useState<string>('')

  const [workers, setWorkers] = useState<Worker[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const [inviteEmail, setInviteEmail] = useState('')
  const [siteAssignPick, setSiteAssignPick] = useState<Record<string, string>>({})
  const [workerAssignPick, setWorkerAssignPick] = useState<Record<string, string>>({})

  useEffect(() => {
    setTab(sp.get('tab') || 'workers')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(t)
  }, [toast])

  function goTab(next: string) {
    router.replace(`/admin?tab=${encodeURIComponent(next)}`)
  }

  async function ensureSession() {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token || ''
    setToken(accessToken)
    return accessToken
  }

  async function refreshAll(tkn?: string) {
    const t = tkn || token || (await ensureSession())
    if (!t) throw new Error('Нет сессии. Войдите заново.')

    const [w, s, a] = await Promise.all([
      authedFetch('/api/admin/workers/list', t),
      authedFetch('/api/admin/sites/list', t),
      authedFetch('/api/admin/assignments', t),
    ])

    setWorkers(w.workers || [])
    setSites(s.sites || [])
    setAssignments(a.assignments || [])
  }

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        setErr('')
        const t = await ensureSession()
        if (!t) {
          setLoading(false)
          return
        }
        await refreshAll(t)
      } catch (e: any) {
        setErr(e?.message || 'Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const workersOnly = useMemo(() => workers.filter((w) => w.role === 'worker'), [workers])
  const activeWorkersOnly = useMemo(() => workersOnly.filter((w) => w.active !== false), [workersOnly])

  const assignmentsBySite = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of assignments) {
      if (!m.has(a.site_id)) m.set(a.site_id, new Set())
      m.get(a.site_id)!.add(a.worker_id)
    }
    return m
  }, [assignments])

  const assignmentsByWorker = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of assignments) {
      if (!m.has(a.worker_id)) m.set(a.worker_id, new Set())
      m.get(a.worker_id)!.add(a.site_id)
    }
    return m
  }, [assignments])

  async function doRefresh() {
    try {
      setBusy(true)
      setErr('')
      await refreshAll()
      setToast('Обновлено')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка обновления')
    } finally {
      setBusy(false)
    }
  }

  async function doAssign(siteId: string, workerId: string) {
    try {
      setBusy(true)
      setErr('')
      if (!token) throw new Error('Нет токена')
      await authedFetch('/api/admin/assignments', token, {
        method: 'POST',
        body: JSON.stringify({ site_id: siteId, worker_id: workerId }),
      })
      await refreshAll()
      setToast('Назначено')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка назначения')
    } finally {
      setBusy(false)
    }
  }

  async function doUnassign(siteId: string, workerId: string) {
    try {
      setBusy(true)
      setErr('')
      if (!token) throw new Error('Нет токена')
      await authedFetch('/api/admin/assignments', token, {
        method: 'DELETE',
        body: JSON.stringify({ site_id: siteId, worker_id: workerId }),
      })
      await refreshAll()
      setToast('Снято')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка снятия')
    } finally {
      setBusy(false)
    }
  }

  async function doInvite() {
    try {
      setBusy(true)
      setErr('')
      if (!token) throw new Error('Нет токена')
      const email = inviteEmail.trim()
      if (!email) throw new Error('Введите email')
      await authedFetch('/api/admin/workers/invite', token, {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setInviteEmail('')
      await refreshAll()
      setToast('Приглашение отправлено')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка приглашения')
    } finally {
      setBusy(false)
    }
  }

  async function doLogout() {
    await supabase.auth.signOut()
    setToken('')
    setWorkers([])
    setSites([])
    setAssignments([])
    router.replace('/admin?tab=workers')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs tracking-widest text-zinc-400">TANIJA</div>
            <h1 className="text-2xl font-semibold">
              Админ-панель <span className="text-amber-400">Cleaning Timeclock</span>
            </h1>
            <div className="mt-1 text-sm text-zinc-400">Управленческий блок: объекты ↔ работники</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={doRefresh}
              disabled={busy || loading}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm shadow',
                'border-amber-500/30 bg-zinc-900 hover:bg-zinc-800',
                (busy || loading) && 'opacity-60'
              )}
            >
              Обновить данные
            </button>
            <button
              onClick={doLogout}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => goTab(t.key)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm transition',
                tab === t.key
                  ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40'
                  : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 ring-1 ring-zinc-800'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {toast ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            {toast}
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">Загрузка…</div>
        ) : !token ? (
          <LoginBlock
            onLoggedIn={async () => {
              const t = await ensureSession()
              if (t) await refreshAll(t)
            }}
          />
        ) : tab === 'sites' ? (
          <SitesTab
            busy={busy}
            sites={sites}
            workers={activeWorkersOnly}
            assignmentsBySite={assignmentsBySite}
            onAssign={doAssign}
            onUnassign={doUnassign}
            pick={siteAssignPick}
            setPick={setSiteAssignPick}
            onCopyCoords={async (s) => {
              if (!hasCoords(s)) return
              await copyToClipboard(`${s.lat}, ${s.lng}`)
              setToast('Координаты скопированы')
            }}
          />
        ) : tab === 'workers' ? (
          <WorkersTab
            busy={busy}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            onInvite={doInvite}
            workers={workersOnly}
            sites={sites}
            assignmentsByWorker={assignmentsByWorker}
            onAssign={doAssign}
            onUnassign={doUnassign}
            pick={workerAssignPick}
            setPick={setWorkerAssignPick}
          />
        ) : tab === 'reports' ? (
          <Stub title="Отчёты" text="Следующий шаг: часы по работникам/объектам + экспорт CSV." />
        ) : tab === 'jobs' ? (
          <Stub title="Задания" text="Следующий шаг: planned → in_progress → done + назначение на работника." />
        ) : tab === 'schedule' ? (
          <Stub title="Расписание" text="Следующий шаг: календарный вид (неделя/день) по объектам и работникам." />
        ) : (
          <Stub title="Настройки" text="Следующий шаг: политики безопасности, авто-выход, аудит-лог." />
        )}
      </div>
    </div>
  )
}

function Card(props: { title: string; subtitle?: string; children: any }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow">
      <div className="border-b border-zinc-800 p-4">
        <div className="text-base font-semibold">{props.title}</div>
        {props.subtitle ? <div className="mt-1 text-sm text-zinc-400">{props.subtitle}</div> : null}
      </div>
      <div className="p-4">{props.children}</div>
    </div>
  )
}

function Pill(props: { children: any }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
      {props.children}
    </span>
  )
}

function Stub({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-6">
      <Card title={title} subtitle="В работе">
        <div className="text-sm text-zinc-300">{text}</div>
      </Card>
    </div>
  )
}

function LoginBlock({ onLoggedIn }: { onLoggedIn: () => Promise<void> | void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function login() {
    try {
      setBusy(true)
      setErr('')
      const e = email.trim()
      if (!e || !password) throw new Error('Введите email и пароль')
      const { error } = await supabase.auth.signInWithPassword({ email: e, password })
      if (error) throw new Error(error.message)
      await onLoggedIn()
    } catch (e: any) {
      setErr(e?.message || 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <Card title="Вход администратора" subtitle="Только для роли admin">
        <div className="grid gap-3 sm:max-w-md">
          {err ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
          ) : null}
          <input
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-amber-500/40"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-amber-500/40"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
          <button
            onClick={login}
            disabled={busy}
            className={cn(
              'rounded-xl border px-4 py-3 text-sm shadow',
              'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15',
              busy && 'opacity-60'
            )}
          >
            Войти
          </button>
        </div>
      </Card>
    </div>
  )
}

function SitesTab(props: {
  busy: boolean
  sites: Site[]
  workers: Worker[]
  assignmentsBySite: Map<string, Set<string>>
  onAssign: (siteId: string, workerId: string) => void
  onUnassign: (siteId: string, workerId: string) => void
  pick: Record<string, string>
  setPick: (v: Record<string, string>) => void
  onCopyCoords: (s: Site) => void
}) {
  return (
    <div className="mt-6 grid gap-4">
      <Card title="Объекты" subtitle="Назначение работников на объект. Техданные спрятаны в раскрывашку.">
        {props.sites.length === 0 ? (
          <div className="text-sm text-zinc-400">Объектов пока нет.</div>
        ) : (
          <div className="grid gap-3">
            {props.sites.map((s) => {
              const assigned = props.assignmentsBySite.get(s.id) || new Set<string>()
              const pickVal = props.pick[s.id] || ''
              const available = props.workers.filter((w) => !assigned.has(w.id))

              const r = radiusMeters(s)
              const coordsOk = hasCoords(s)

              return (
                <div key={s.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-zinc-100">{prettySiteName(s)}</div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Array.from(assigned).length === 0 ? (
                          <span className="text-sm text-zinc-400">Пока никто не назначен</span>
                        ) : (
                          Array.from(assigned).map((wid) => (
                            <span key={wid} className="flex items-center gap-2">
                              <Pill>{wid}</Pill>
                              <button
                                onClick={() => props.onUnassign(s.id, wid)}
                                disabled={props.busy}
                                className={cn(
                                  'rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800',
                                  props.busy && 'opacity-60'
                                )}
                              >
                                Снять
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      <details className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                        <summary className="cursor-pointer text-sm text-zinc-300 select-none">
                          Техданные
                        </summary>
                        <div className="mt-2 grid gap-2 text-xs text-zinc-400">
                          <div>Код объекта: <span className="text-zinc-200">{s.id}</span></div>
                          <div>
                            Радиус допуска: <span className="text-zinc-200">{r ?? '—'} м</span>
                          </div>
                          <div>
                            Координаты: <span className="text-zinc-200">
                              {coordsOk ? `${s.lat!.toFixed(5)}, ${s.lng!.toFixed(5)}` : '—'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => props.onCopyCoords(s)}
                              disabled={!coordsOk}
                              className={cn(
                                'rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs hover:bg-zinc-800',
                                !coordsOk && 'opacity-60'
                              )}
                            >
                              Скопировать координаты
                            </button>
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className="w-full sm:w-96">
                      <div className="grid gap-2">
                        <select
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-amber-500/40"
                          value={pickVal}
                          onChange={(e) => props.setPick({ ...props.pick, [s.id]: e.target.value })}
                        >
                          <option value="">Выбери работника…</option>
                          {available.map((w) => (
                            <option key={w.id} value={w.id}>
                              {prettyWorkerName(w)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => pickVal && props.onAssign(s.id, pickVal)}
                          disabled={props.busy || !pickVal}
                          className={cn(
                            'rounded-xl border px-4 py-3 text-sm shadow',
                            'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15',
                            (props.busy || !pickVal) && 'opacity-60'
                          )}
                        >
                          Назначить
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Список скрывает уже назначенных работников.</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function WorkersTab(props: {
  busy: boolean
  inviteEmail: string
  setInviteEmail: (v: string) => void
  onInvite: () => void
  workers: Worker[]
  sites: Site[]
  assignmentsByWorker: Map<string, Set<string>>
  onAssign: (siteId: string, workerId: string) => void
  onUnassign: (siteId: string, workerId: string) => void
  pick: Record<string, string>
  setPick: (v: Record<string, string>) => void
}) {
  return (
    <div className="mt-6 grid gap-4">
      <Card title="Работники" subtitle="Приглашение + назначение объектов работнику.">
        <div className="grid gap-3 sm:flex sm:items-end sm:gap-3">
          <div className="flex-1">
            <div className="text-sm text-zinc-400">Пригласить работника (email)</div>
            <input
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-amber-500/40"
              placeholder="worker@example.com"
              value={props.inviteEmail}
              onChange={(e) => props.setInviteEmail(e.target.value)}
            />
          </div>
          <button
            onClick={props.onInvite}
            disabled={props.busy}
            className={cn(
              'rounded-xl border px-4 py-3 text-sm shadow',
              'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15',
              props.busy && 'opacity-60'
            )}
          >
            Отправить приглашение
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {props.workers.length === 0 ? (
            <div className="text-sm text-zinc-400">Работников пока нет.</div>
          ) : (
            props.workers.map((w) => {
              const assigned = props.assignmentsByWorker.get(w.id) || new Set<string>()
              const pickVal = props.pick[w.id] || ''
              const availableSites = props.sites.filter((s) => !assigned.has(s.id))

              return (
                <div key={w.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-base font-semibold">{prettyWorkerName(w)}</div>

                      <details className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                        <summary className="cursor-pointer text-sm text-zinc-300 select-none">
                          Техданные
                        </summary>
                        <div className="mt-2 text-xs text-zinc-400">
                          Код работника: <span className="text-zinc-200">{w.id}</span>
                        </div>
                      </details>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Array.from(assigned).length === 0 ? (
                          <span className="text-sm text-zinc-400">Пока нет назначенных объектов</span>
                        ) : (
                          Array.from(assigned).map((sid) => (
                            <span key={sid} className="flex items-center gap-2">
                              <Pill>{sid}</Pill>
                              <button
                                onClick={() => props.onUnassign(sid, w.id)}
                                disabled={props.busy}
                                className={cn(
                                  'rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800',
                                  props.busy && 'opacity-60'
                                )}
                              >
                                Снять
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="w-full sm:w-96">
                      <div className="grid gap-2">
                        <select
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-amber-500/40"
                          value={pickVal}
                          onChange={(e) => props.setPick({ ...props.pick, [w.id]: e.target.value })}
                        >
                          <option value="">Выбери объект…</option>
                          {availableSites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {prettySiteName(s)}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => pickVal && props.onAssign(pickVal, w.id)}
                          disabled={props.busy || !pickVal}
                          className={cn(
                            'rounded-xl border px-4 py-3 text-sm shadow',
                            'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15',
                            (props.busy || !pickVal) && 'opacity-60'
                          )}
                        >
                          Назначить объект
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Список скрывает уже назначенные объекты.</div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}
