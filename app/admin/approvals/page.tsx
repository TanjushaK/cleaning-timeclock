'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch'

type PendingWorker = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  email_confirmed_at: string | null
  onboarding_submitted_at: string | null
  avatar_url: string | null
  can_activate: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtDT(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())
}

function isE164(s: string) {
  return /^\+[1-9]\d{6,14}$/.test(String(s || '').trim())
}

export default function AdminApprovalsPage() {
  const { t } = useI18n()
  const BG = 'bg-[#0b0604]'
  const CARD =
    'border border-amber-500/20 bg-[#120806]/70 shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur'
  const SOFT = 'border border-amber-500/15 bg-black/20'
  const BTN = 'rounded-2xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60'
  const BTN_PRI = 'rounded-2xl bg-amber-500 text-[#120806] px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60'

  const [booting, setBooting] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [items, setItems] = useState<PendingWorker[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')

  const [editById, setEditById] = useState<Record<string, { phone: string; email: string }>>({})

  const authed = !!token

  const refresh = useCallback(async () => {
    setError(null)
    setNotice(null)
    const r = await authFetchJson<{ pending: PendingWorker[] }>('/api/admin/workers/pending', { cache: 'no-store' })
    const list = Array.isArray(r?.pending) ? r.pending : []
    setItems(list)

    setEditById((prev) => {
      const next = { ...prev }
      for (const w of list) {
        if (!w?.id) continue
        if (!next[w.id]) {
          next[w.id] = { phone: w.phone || '', email: w.email || '' }
        }
      }
      return next
    })
  }, [])

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

  const activate = useCallback(
    async (id: string, force: boolean) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await authFetchJson('/api/admin/workers/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: id, force }),
        })
        setNotice(t('admin.approvals.noticeActivated'))
        await refresh()
      } catch (e: unknown) {
        setError(String((e as { message?: string })?.message || e || t('admin.approvals.errorActivation')))
      } finally {
        setBusy(false)
      }
    },
    [refresh, t],
  )

  const inviteWorker = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const em = inviteEmail.trim()
      if (!em) throw new Error(t('admin.approvals.errNeedIdentifier'))
      if (em.includes('@')) {
        if (!isEmail(em)) throw new Error(t('admin.approvals.errInvalidEmail'))
      } else {
        if (!isE164(em)) throw new Error(t('admin.approvals.errPhoneE164'))
      }

      const out = await authFetchJson('/api/admin/workers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: em, role: 'worker', active: false }),
      })

      setInviteEmail('')
      const login = String((out as { login?: string })?.login || em)
      const pw = String((out as { password?: string })?.password || '')
      setNotice(t('admin.approvals.inviteNotice', { login, password: pw }))
      await refresh().catch(() => null)
    } catch (e: unknown) {
      setError(String((e as { message?: string })?.message || e || t('admin.approvals.errInvite')))
    } finally {
      setBusy(false)
    }
  }, [inviteEmail, refresh, t])

  const saveContact = useCallback(
    async (id: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const v = editById[id] || { phone: '', email: '' }
        const phone = v.phone.trim()
        const em = v.email.trim()

        if (phone && !isE164(phone)) throw new Error(t('admin.approvals.errPhoneE164'))
        if (em && !isEmail(em)) throw new Error(t('admin.approvals.errInvalidEmail'))

        await authFetchJson(`/api/admin/workers/${encodeURIComponent(id)}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone ? phone : null, email: em ? em : null }),
        })

        setNotice(t('admin.approvals.noticeSaved'))
        await refresh()
      } catch (e: unknown) {
        setError(String((e as { message?: string })?.message || e || t('admin.approvals.errSave')))
      } finally {
        setBusy(false)
      }
    },
    [editById, refresh, t],
  )

  const pendingCount = useMemo(() => items.length, [items])

  if (booting) {
    return (
      <div className={`min-h-screen ${BG} text-amber-100 flex items-center justify-center`}>
        <div className="text-sm opacity-80">{t('admin.common.loading')}</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className={`min-h-screen ${BG} text-amber-100 flex items-center justify-center p-4`}>
        <div className={`w-full max-w-md rounded-3xl ${CARD} p-6`}>
          <div className="text-xl font-semibold">{t('admin.approvals.title')}</div>
          <div className="mt-1 text-xs text-amber-200/70">
            {t('admin.common.footerTagline')} <span className="opacity-80">{t('admin.common.footerYear', { year: 2026 })}</span>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-2xl bg-black/30 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('admin.common.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <input
              className="w-full rounded-2xl bg-black/30 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('admin.common.passwordPlaceholder')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button className={`w-full ${BTN_PRI}`} onClick={doLogin} disabled={busy || !email.trim() || !password.trim()}>
              {busy ? t('admin.common.signingIn') : t('admin.common.signIn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${BG} text-amber-100 p-4 sm:p-6`}>
      <div className="mx-auto max-w-6xl">
        <div className={`rounded-3xl ${CARD} p-5 sm:p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-2xl font-semibold">{t('admin.approvals.title')}</div>
              <div className="text-sm text-amber-200/70 mt-1">{t('admin.approvals.pendingIntro', { count: pendingCount })}</div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              <a className={BTN} href="/admin">
                {t('admin.common.adminHome')}
              </a>
              <button
                className={BTN}
                disabled={busy}
                onClick={() =>
                  void refresh()
                    .then(() => setNotice(t('admin.common.noticeUpdated')))
                    .catch((e) => setError(String((e as { message?: string })?.message || e || t('admin.common.errorGeneric'))))
                }
              >
                {busy ? t('admin.common.refreshing') : t('admin.common.refresh')}
              </button>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

          <div className={`mt-6 rounded-2xl ${SOFT} p-4`}>
            <div className="text-sm font-semibold">{t('admin.approvals.createWorker')}</div>
            <div className="mt-1 text-xs text-amber-200/70">{t('admin.approvals.inviteHint')}</div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="flex-1 rounded-2xl bg-black/30 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder={t('admin.approvals.invitePlaceholder')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="username"
                disabled={busy}
              />
              <button className={BTN_PRI} onClick={inviteWorker} disabled={busy || !inviteEmail.trim()}>
                {busy ? t('admin.approvals.inviteSending') : t('admin.approvals.inviteBtn')}
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {items.length === 0 ? (
              <div className={`rounded-2xl ${SOFT} p-4 text-sm text-amber-200/70`}>{t('admin.approvals.noPending')}</div>
            ) : (
              items.map((w) => {
                const edit = editById[w.id] || { phone: w.phone || '', email: w.email || '' }

                return (
                  <div key={w.id} className={`rounded-2xl ${SOFT} p-4`}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-3">
                        <div className="h-14 w-14 rounded-2xl overflow-hidden border border-amber-500/20 bg-black/30 flex items-center justify-center">
                          {w.avatar_url ? (
                            <img src={w.avatar_url} className="h-full w-full object-cover" alt="" />
                          ) : (
                            <div className="text-xs opacity-60">{t('admin.common.dash')}</div>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{w.full_name || t('admin.common.dash')}</div>
                          <div className="text-xs text-amber-200/70 mt-1">
                            {w.phone ? `📞 ${w.phone}` : ''} {w.email ? ` • ✉️ ${w.email}` : ''}{' '}
                            {w.email ? (w.email_confirmed_at ? t('admin.approvals.emailOk') : t('admin.approvals.emailNotConfirmed')) : ''}
                          </div>
                          <div className="text-xs text-amber-200/60 mt-1">
                            {t('admin.approvals.submittedLabel')} {fmtDT(w.onboarding_submitted_at)}
                          </div>
                          <div className="text-[10px] text-amber-200/40 mt-1">ID: {w.id}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <button className={BTN_PRI} disabled={busy || !w.can_activate} onClick={() => activate(w.id, false)}>
                          {t('admin.approvals.activate')}
                        </button>
                        <button className={BTN} disabled={busy} onClick={() => activate(w.id, true)}>
                          {t('admin.approvals.force')}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="grid gap-1">
                        <span className="text-[11px] text-amber-200/70">{t('admin.approvals.phoneLabel')}</span>
                        <input
                          className="w-full rounded-2xl bg-black/30 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                          placeholder="+31612345678"
                          value={edit.phone}
                          onChange={(e) =>
                            setEditById((p) => ({
                              ...p,
                              [w.id]: { ...(p[w.id] || { phone: '', email: '' }), phone: e.target.value },
                            }))
                          }
                          disabled={busy}
                        />
                      </label>

                      <label className="grid gap-1">
                        <span className="text-[11px] text-amber-200/70">{t('admin.approvals.loginLabel')}</span>
                        <input
                          className="w-full rounded-2xl bg-black/30 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                          placeholder={t('admin.approvals.invitePlaceholder')}
                          value={edit.email}
                          onChange={(e) =>
                            setEditById((p) => ({
                              ...p,
                              [w.id]: { ...(p[w.id] || { phone: '', email: '' }), email: e.target.value },
                            }))
                          }
                          disabled={busy}
                        />
                      </label>

                      <div className="flex items-end">
                        <button className={BTN} disabled={busy} onClick={() => void saveContact(w.id)}>
                          {t('admin.approvals.saveContacts')}
                        </button>
                      </div>
                    </div>

                    {!w.can_activate ? (
                      <div className="mt-3 text-xs text-amber-200/60">
                        {t('admin.approvals.needActivationHint')}
                        {w.email ? ` ${t('admin.approvals.needActivationEmail')}` : ''}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>

          <div className="mt-8 text-center text-[11px] text-amber-200/55">
            {t('admin.common.footerTagline')} <span className="opacity-80">{t('admin.common.footerYear', { year: 2026 })}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
