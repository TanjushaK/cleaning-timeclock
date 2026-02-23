'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const canSave = useMemo(() => pass1.length >= 8 && pass1 === pass2, [pass1, pass2])

  useEffect(() => {
    let unsub: { data: { subscription: { unsubscribe: () => void } } } | null = null

    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data?.session) setReady(true)
    })()

    unsub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    return () => {
      unsub?.data?.subscription?.unsubscribe?.()
    }
  }, [])

  async function onSave() {
    setErr(null)
    setMsg(null)
    if (!canSave) {
      setErr('Пароль минимум 8 символов и должен совпадать')
      return
    }

    setBusy(true)
    try {
      // IMPORTANT: clear temp_password flag so user won't be forced to change password again
      const { error } = await supabase.auth.updateUser({
        password: pass1,
        data: { temp_password: false },
      })
      if (error) throw error

      setMsg('Пароль обновлён. Теперь войди заново.')
      await supabase.auth.signOut()
      setTimeout(() => (window.location.href = '/'), 900)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка обновления')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen text-zinc-100"
      style={{
        background:
          'radial-gradient(900px circle at 18% -8%, rgba(245, 158, 11, 0.16), transparent 55%), radial-gradient(900px circle at 82% 8%, rgba(245, 158, 11, 0.14), transparent 60%), radial-gradient(700px circle at 50% 110%, rgba(245, 158, 11, 0.08), transparent 55%), #120805',
      }}
    >
      <div className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-3xl border border-amber-400/20 bg-black/35 p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.20),0_0_70px_rgba(245,158,11,0.12),0_25px_90px_rgba(0,0,0,0.65)]">
          <div className="flex items-center gap-3">
            <img src="/tanija-logo.png" alt="Tanija" className="h-10 w-10 rounded-xl" />
            <div>
              <div className="text-xl font-semibold tracking-tight text-amber-200">Новый пароль</div>
              <div className="text-sm text-zinc-300/70">Установи новый пароль для аккаунта</div>
            </div>
          </div>

          {!ready ? (
            <div className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-300/5 px-4 py-3 text-sm text-zinc-200/80">
              Открой эту страницу по ссылке из письма.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <label className="block text-sm text-zinc-200/80">Новый пароль</label>
              <input
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                placeholder="Минимум 8 символов"
                type="password"
                className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-300/60"
                autoComplete="new-password"
              />

              <label className="block text-sm text-zinc-200/80">Повтори пароль</label>
              <input
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                placeholder="Повтори пароль"
                type="password"
                className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-300/60"
                autoComplete="new-password"
              />

              <button
                onClick={onSave}
                disabled={busy || !canSave}
                className="mt-2 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-100 transition hover:bg-amber-300/15 disabled:opacity-50"
              >
                {busy ? 'Сохраняю…' : 'Сохранить пароль'}
              </button>

              {msg ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {msg}
                </div>
              ) : null}

              {err ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {err}
                </div>
              ) : null}
            </div>
          )}

          <a
            href="/"
            className="mt-6 block text-center text-sm text-zinc-300/70 underline decoration-amber-300/40 underline-offset-4 hover:text-zinc-100"
          >
            На главную
          </a>
        </div>
      </div>
    </div>
  )
}
