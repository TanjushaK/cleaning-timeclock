'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { clientWorkerErrorMessage } from '@/lib/app-api-message'
import { authFetchJson, clearAuthTokens, getAccessToken } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  role?: string | null
  active?: boolean | null
  full_name?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
  onboarding_submitted_at?: string | null
  avatar_path?: string | null
}

type MeProfileResponse = {
  user: { id: string; email?: string | null; phone?: string | null; email_confirmed_at?: string | null }
  profile: Profile
}

type MyPhotosResponse = {
  photos: Array<{ path: string; url?: string | null }>
  avatar_path: string | null
}

function bearerHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const t = typeof window !== 'undefined' ? window.localStorage.getItem('ct_access_token') : null
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

export default function WorkerProfilePage() {
  const { t } = useI18n()
  const [booting, setBooting] = useState(true)
  const [me, setMe] = useState<MeProfileResponse | null>(null)

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')

  const [photos, setPhotos] = useState<Array<{ path: string; url?: string | null }>>([])
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const authed = !!getAccessToken()

  const loadPhotos = useCallback(async () => {
    const data = await authFetchJson<MyPhotosResponse>('/api/me/photos', {
      headers: bearerHeaders(),
      cache: 'no-store',
    })
    setPhotos(Array.isArray(data.photos) ? data.photos : [])
    setAvatarPath(data.avatar_path || null)
  }, [])

  const loadMe = useCallback(async () => {
    setError(null)
    setNotice(null)

    const profile = await authFetchJson<MeProfileResponse>('/api/me/profile', { cache: 'no-store' })
    setMe(profile)

    setFullName(String(profile?.profile?.full_name || ''))
    setPhone(String(profile?.profile?.phone || profile?.user?.phone || ''))
    setEmail(String(profile?.profile?.email || profile?.user?.email || ''))
    setNotes(String(profile?.profile?.notes || ''))

    await loadPhotos().catch(() => {})
  }, [loadPhotos])

  useEffect(() => {
    ;(async () => {
      try {
        if (!getAccessToken()) {
          setBooting(false)
          return
        }
        await loadMe()
      } catch (e: unknown) {
        setError(clientWorkerErrorMessage(t, e))
      } finally {
        setBooting(false)
      }
    })()
  }, [loadMe, t])

  const logout = useCallback(() => {
    clearAuthTokens()
    try {
      supabase.auth.signOut()
    } catch {}
    window.location.replace('/')
  }, [])

  const save = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const name = fullName.trim()
      if (!name) throw new Error(t('errors.nameRequired'))

      const payload = {
        full_name: name,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes || '',
      }

      await authFetchJson('/api/me/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (email.trim()) {
        try {
          await supabase.auth.updateUser({ email: email.trim() })
        } catch {}
      }

      await loadMe()
      setNotice(t('notify.saved'))
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(t, e))
    } finally {
      setBusy(false)
    }
  }, [email, fullName, loadMe, notes, phone, t])

  const setPassword = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const p1 = newPassword.trim()
      const p2 = newPassword2.trim()
      if (p1.length < 8) throw new Error(t('errors.passwordMin8'))
      if (p1 !== p2) throw new Error(t('errors.passwordMismatch'))
      await supabase.auth.updateUser({ password: p1, data: { temp_password: false } })
      setNewPassword('')
      setNewPassword2('')
      await loadMe().catch(() => {})
      setNotice(t('notify.passwordSetEmailLogin'))
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(t, e))
    } finally {
      setBusy(false)
    }
  }, [loadMe, newPassword, newPassword2, t])

  const uploadPhoto = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const fd = new FormData()
        fd.append('file', file)
        await authFetchJson('/api/me/photos', { method: 'POST', headers: bearerHeaders(), body: fd })
        await loadPhotos()
        setNotice(t('notify.photoUploaded'))
      } catch (e: unknown) {
        setError(clientWorkerErrorMessage(t, e))
      } finally {
        setBusy(false)
        setFileInputKey((k) => k + 1)
      }
    },
    [loadPhotos, t],
  )

  const delPhoto = useCallback(
    async (path: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await authFetchJson('/api/me/photos', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...bearerHeaders() },
          body: JSON.stringify({ path }),
        })
        await loadPhotos()
        setNotice(t('notify.deleted'))
      } catch (e: unknown) {
        setError(clientWorkerErrorMessage(t, e))
      } finally {
        setBusy(false)
      }
    },
    [loadPhotos, t],
  )

  const makeAvatar = useCallback(
    async (path: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await authFetchJson('/api/me/photos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...bearerHeaders() },
          body: JSON.stringify({ action: 'make_primary', path }),
        })
        await loadPhotos()
        setNotice(t('notify.avatarSet'))
      } catch (e: unknown) {
        setError(clientWorkerErrorMessage(t, e))
      } finally {
        setBusy(false)
      }
    },
    [loadPhotos, t],
  )

  if (booting) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center">
        <div className="text-sm opacity-80">{t('boot.loading')}</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
          <div className="text-lg font-semibold">{t('profile.needLoginTitle')}</div>
          <div className="text-sm opacity-80 mt-2">{t('profile.needLoginBody')}</div>
          <a
            className="mt-4 inline-block rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
            href="/"
          >
            {t('nav.home')}
          </a>
        </div>
      </div>
    )
  }

  const roleLabel = me?.profile?.role || t('active.roleWorker')
  const activeYes = me?.profile?.active === true ? t('onboarding.emailYes') : t('onboarding.emailNo')

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">{t('profile.pageTitle')}</div>
            <div className="text-sm opacity-80 mt-1">
              {roleLabel} • {t('profile.activeLabel')}: {activeYes}
            </div>
          </div>
          <div className="flex gap-2">
            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/">
              {t('nav.back')}
            </a>
            <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={logout}>
              {t('active.logout')}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl">
          <div className="text-lg font-semibold">{t('onboarding.dataTitle')}</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('onboarding.namePlaceholder')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <input
              className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('login.phonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="md:col-span-2 rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('onboarding.emailOptionalPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <textarea
              className="md:col-span-2 min-h-[110px] rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('profile.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
              disabled={busy}
              onClick={save}
            >
              {busy ? t('onboarding.saving') : t('onboarding.save')}
            </button>
            <button
              className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                setNotice(null)
                try {
                  await loadMe()
                  setNotice(t('notify.refreshed'))
                } catch (e: unknown) {
                  setError(clientWorkerErrorMessage(t, e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? t('onboarding.refreshBusy') : t('onboarding.refresh')}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl">
          <div className="text-lg font-semibold">{t('login.tabPassword')}</div>
          <div className="mt-2 text-sm opacity-80">{t('profile.passwordLoginHint')}</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('tempPassword.newPlaceholder')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder={t('tempPassword.repeatPlaceholder')}
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button
              className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
              disabled={busy || !newPassword.trim() || !newPassword2.trim()}
              onClick={setPassword}
            >
              {busy ? t('tempPassword.saving') : t('login.setPassword')}
            </button>
            <div className="text-xs opacity-70 self-center">
              {t('profile.emailConfirmedShort')}:{' '}
              {me?.user?.email ? (me?.user?.email_confirmed_at ? t('onboarding.emailYes') : t('onboarding.emailNo')) : t('onboarding.emailDash')}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold">{t('onboarding.photosTitle')}</div>
            <div className="text-sm opacity-70">{photos.length}/5</div>
          </div>

          <div className="mt-3">
            <input
              key={fileInputKey}
              type="file"
              accept="image/*"
              className="block w-full text-sm"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadPhoto(f)
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {photos.map((p) => {
              const isAvatar = avatarPath && p.path === avatarPath
              return (
                <div key={p.path} className="rounded-xl border border-amber-500/15 bg-zinc-900/30 overflow-hidden">
                  <div className="aspect-square bg-black/30 flex items-center justify-center">
                    {p.url ? (
                      <img src={p.url} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <div className="text-xs opacity-60">{t('onboarding.emailDash')}</div>
                    )}
                  </div>
                  <div className="p-2 space-y-2">
                    <button
                      className="w-full rounded-lg bg-amber-500 text-zinc-950 px-2 py-1 text-xs font-semibold hover:bg-amber-400 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => makeAvatar(p.path)}
                    >
                      {isAvatar ? t('onboarding.avatar') : t('onboarding.makeAvatar')}
                    </button>
                    <button
                      className="w-full rounded-lg border border-amber-500/30 px-2 py-1 text-xs hover:bg-amber-500/10 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => delPhoto(p.path)}
                    >
                      {t('onboarding.delete')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {photos.length === 0 ? <div className="mt-3 text-sm opacity-70">{t('onboarding.photosEmpty')}</div> : null}
        </div>
      </div>
    </div>
  )
}
