'use client'

import { useLayoutEffect } from 'react'
import { getRefreshToken, setAuthTokens } from '@/lib/auth-fetch'

export default function AdminSessionWarmup() {
  useLayoutEffect(() => {
    const rt = getRefreshToken()
    if (!rt) return

    // Best-effort refresh: keeps admin from re-logging in all day.
    // If refresh fails — do nothing here; pages will handle auth errors.
    void (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok) return
        if (!j?.access_token) return
        setAuthTokens(String(j.access_token), j.refresh_token ? String(j.refresh_token) : null)
      } catch {
        // ignore
      }
    })()
  }, [])

  return null
}


