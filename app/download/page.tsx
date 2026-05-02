'use client'

import { useEffect, useRef } from 'react'

const WEB_URL = 'https://timeclock.tanjusha.nl'
/** Replace with Google Play or EAS APK when ready. Placeholder avoids redirect loop on this page. */
const ANDROID_URL = 'https://timeclock.tanjusha.nl/download#android'
/** Replace with App Store / TestFlight when ready; temporarily same as web. */
const IOS_URL = 'https://timeclock.tanjusha.nl'

/** Same-origin placeholder hash: never auto-redirect Android (would loop / flash). */
function shouldSkipAndroidAutoRedirect(): boolean {
  try {
    const u = new URL(ANDROID_URL)
    return u.hash === '#android' || ANDROID_URL.includes('/download#android')
  } catch {
    return ANDROID_URL.includes('#android')
  }
}

function detectIos(ua: string): boolean {
  const lower = ua.toLowerCase()
  if (/iphone|ipad|ipod/.test(lower)) return true
  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { maxTouchPoints?: number }
    if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return true
  }
  return false
}

export default function DownloadPage() {
  const redirectedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent.toLowerCase()
    const isAndroid = ua.includes('android')
    const isIos = detectIos(navigator.userAgent)
    const skipAndroidRedirect = shouldSkipAndroidAutoRedirect()

    if (redirectedRef.current) return

    if (isAndroid && skipAndroidRedirect) {
      return
    }

    if (isAndroid && !skipAndroidRedirect) {
      redirectedRef.current = true
      window.location.href = ANDROID_URL
      return
    }

    if (isIos) {
      redirectedRef.current = true
      window.location.href = IOS_URL
      return
    }

    redirectedRef.current = true
    window.location.href = WEB_URL
  }, [])

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-amber-400/20 bg-black/40 px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/90">
          Tanjusha
        </p>
        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight text-zinc-50">Timeclock</h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-zinc-400">
          Один QR-код автоматически откроет нужную версию для вашего устройства.
        </p>
        <p className="mt-2 text-center text-sm leading-relaxed text-zinc-400">
          One QR code opens the right version for your device.
        </p>

        <p className="mt-6 text-center text-sm font-medium text-zinc-200">Выберите версию приложения</p>
        <p className="mt-1 text-center text-xs text-zinc-500">Choose your app version</p>

        <div className="mt-6 flex flex-col gap-3">
          <a
            href={ANDROID_URL}
            className="rounded-2xl border border-amber-400/35 bg-amber-400/15 px-4 py-3 text-center text-sm font-semibold text-amber-50 transition hover:border-amber-300/55 hover:bg-amber-400/25"
          >
            Android
          </a>
          <a
            href={IOS_URL}
            className="rounded-2xl border border-amber-400/35 bg-amber-400/15 px-4 py-3 text-center text-sm font-semibold text-amber-50 transition hover:border-amber-300/55 hover:bg-amber-400/25"
          >
            iPhone / iPad
          </a>
          <a
            href={WEB_URL}
            className="rounded-2xl border border-zinc-500/40 bg-zinc-900/40 px-4 py-3 text-center text-sm font-semibold text-zinc-100 transition hover:border-zinc-400/50 hover:bg-zinc-800/50"
          >
            Web version
          </a>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-zinc-500">
          Если переход не начался, используйте кнопки выше.
          <br />
          If nothing opened automatically, use the buttons above.
        </p>
      </div>
    </main>
  )
}
