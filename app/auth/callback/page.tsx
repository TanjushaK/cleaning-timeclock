'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { setAuthTokens } from '@/lib/auth-fetch'

export default function AuthCallbackPage() {
  const [msg, setMsg] = useState('Завершаю вход…')

  useEffect(() => {
    ;(async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // fallback на старый implicit flow (#access_token=...)
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
          const access_token = hash.get('access_token')
          const refresh_token = hash.get('refresh_token')
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (error) throw error
          }
        }

        const { data, error: sErr } = await supabase.auth.getSession()
        if (sErr) throw sErr
        const session = data?.session
        if (!session?.access_token) throw new Error('Сессия не получена')

        setAuthTokens(session.access_token, session.refresh_token || null)

        window.location.replace('/')
      } catch (e: any) {
        setMsg(`Ошибка входа: ${String(e?.message || e)}`)
      }
    })()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
        <div className="text-sm opacity-80">{msg}</div>
      </div>
    </div>
  )
}
