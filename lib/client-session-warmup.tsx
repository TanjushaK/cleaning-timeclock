'use client'

import { useEffect } from 'react'
import { appAuth } from '@/lib/browser-auth'
import { getAccessToken, getRefreshToken, setAuthTokens } from '@/lib/auth-fetch'

export default function ClientSessionWarmup() {
  useEffect(() => {
    const at = getAccessToken()
    const rt = getRefreshToken()
    if (!at || !rt) return

    void (async () => {
      try {
        // 1) Hydrate in-memory auth session from stored tokens
        const { error } = await appAuth.auth.setSession({ access_token: at, refresh_token: rt })
        if (!error) return

        // 2) If access token is stale — refresh via API, then hydrate again
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.access_token) return

        setAuthTokens(String(j.access_token), j.refresh_token ? String(j.refresh_token) : null)

        const at2 = getAccessToken()
        const rt2 = getRefreshToken()
        if (!at2 || !rt2) return
        await appAuth.auth.setSession({ access_token: at2, refresh_token: rt2 })
      } catch {
        // best-effort
      }
    })()
  }, [])

  return null
}
