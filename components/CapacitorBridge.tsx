'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * На нативних оболонках (Capacitor) ховає splash і підлаштовує статус-бар.
 * У звичайному браузері нічого не робить.
 */
export default function CapacitorBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false

    void (async () => {
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        if (cancelled) return
        await SplashScreen.hide().catch(() => {})
        await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
        await StatusBar.setBackgroundColor({ color: '#120805' }).catch(() => {})
      } catch {
        // плагіни можуть бути недоступні під час SSR / тестів
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
