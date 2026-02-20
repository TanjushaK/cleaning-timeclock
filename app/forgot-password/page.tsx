'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const canSend = useMemo(() => email.trim().length >= 5 && email.includes('@'), [email])

  async function onSend() {
    setErr(null)
    setMsg(null)
    if (!canSend) {
      setErr('Введите email')
      return
    }

    setBusy(true)
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw error
      setMsg('Ссылка отправлена на email. Открой письмо и перейди по ссылке.')
    } catch (e: any) {
      setErr(e?.message || 'Ошибка отправки')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100">
      <div className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-3xl border border-amber-400/20 bg-gradient-to-b from-[#0b0b12] to-[#07070b] p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <img src="/tanija-logo.png" alt="Tanija" className="h-10 w-10 rounded-xl" />
            <div>
              <div className="text-xl font-semibold tracking-tight text-amber-200">Восстановление пароля</div>
              <div className="text-sm text-zinc-400">Мы пришлём ссылку на email</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm text-zinc-300">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-300/60"
              autoComplete="email"
              inputMode="email"
            />

            <button
              onClick={onSend}
              disabled={busy || !canSend}
              className="mt-2 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
            >
              {busy ? 'Отправляю…' : 'Отправить ссылку'}
            </button>

            <Link
              href="/"
              className="block text-center text-sm text-zinc-400 underline decoration-amber-300/40 underline-offset-4 hover:text-zinc-200"
            >
              Назад к входу
            </Link>

            {msg ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {msg}
              </div>
            ) : null}

            {err ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-zinc-500">
          В Supabase Auth добавь Redirect URL: <span className="text-zinc-300">/reset-password</span>
        </div>
      </div>
    </div>
  )
}
