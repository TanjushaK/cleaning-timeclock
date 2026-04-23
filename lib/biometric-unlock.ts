'use client'

import { Capacitor } from '@capacitor/core'
import { getRefreshToken, setAuthTokens } from '@/lib/auth-fetch'

/** Keychain / Keystore namespace for stored refresh material (not the account password). */
export const BIOMETRIC_CREDENTIAL_SERVER = 'nl.tanjusha.timeclock.biometric.v1'

const LS_BIO_FLAG = 'ct_bio_unlock_saved'

export function isNativeCapacitorApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function hasBiometricUnlockFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(LS_BIO_FLAG) === '1'
  } catch {
    return false
  }
}

export function setBiometricUnlockFlag(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(LS_BIO_FLAG, '1')
    else window.localStorage.removeItem(LS_BIO_FLAG)
  } catch {
    // ignore
  }
}

export async function biometricHardwareAvailable(): Promise<boolean> {
  if (!isNativeCapacitorApp()) return false
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    const r = await NativeBiometric.isAvailable({ useFallback: false })
    return Boolean(r?.isAvailable)
  } catch {
    return false
  }
}

/**
 * Checks whether biometric refresh credentials already exist in Keychain/Keystore.
 * Useful when localStorage flag was cleared but native secure storage still has data.
 */
export async function hasStoredBiometricCredentials(): Promise<boolean> {
  if (!isNativeCapacitorApp()) return false
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    const avail = await NativeBiometric.isAvailable({ useFallback: false })
    if (!avail?.isAvailable) return false
    const creds = await NativeBiometric.getCredentials({ server: BIOMETRIC_CREDENTIAL_SERVER })
    const refresh = String(creds?.password || '').trim()
    const hasCreds = refresh.length > 0
    if (hasCreds) setBiometricUnlockFlag(true)
    return hasCreds
  } catch {
    return false
  }
}

export async function clearBiometricStoredCredentials(): Promise<void> {
  if (!isNativeCapacitorApp()) return
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_CREDENTIAL_SERVER })
  } catch {
    // ignore
  }
  setBiometricUnlockFlag(false)
}

/**
 * Stores current refresh token in Keychain/Keystore after successful biometric proof.
 * Does not store the account password.
 */
export async function enableBiometricUnlock(strings: {
  reason: string
  title: string
  subtitle: string
  description: string
  cancel: string
}): Promise<void> {
  if (!isNativeCapacitorApp()) throw new Error('biometric_native_only')
  const rt = getRefreshToken()
  if (!rt) throw new Error('biometric_no_refresh')

  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
  const avail = await NativeBiometric.isAvailable({ useFallback: false })
  if (!avail?.isAvailable) throw new Error('biometric_unavailable')

  await NativeBiometric.verifyIdentity({
    reason: strings.reason,
    title: strings.title,
    subtitle: strings.subtitle,
    description: strings.description,
    negativeButtonText: strings.cancel,
    useFallback: false,
  })

  await NativeBiometric.setCredentials({
    username: 'refresh_session',
    password: rt,
    server: BIOMETRIC_CREDENTIAL_SERVER,
  })
  setBiometricUnlockFlag(true)
}

/**
 * Biometric prompt + refresh session from stored refresh token.
 * Returns true if tokens were installed.
 */
export async function unlockSessionWithBiometrics(strings: {
  reason: string
  title: string
  subtitle: string
  description: string
  cancel: string
}): Promise<boolean> {
  if (!isNativeCapacitorApp()) return false

  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
  const avail = await NativeBiometric.isAvailable({ useFallback: false })
  if (!avail?.isAvailable) return false

  await NativeBiometric.verifyIdentity({
    reason: strings.reason,
    title: strings.title,
    subtitle: strings.subtitle,
    description: strings.description,
    negativeButtonText: strings.cancel,
    useFallback: false,
  })

  const creds = await NativeBiometric.getCredentials({ server: BIOMETRIC_CREDENTIAL_SERVER })
  const refresh = String(creds?.password || '').trim()
  if (!refresh) return false

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
  const j = (await res.json().catch(() => null)) as {
    access_token?: string
    refresh_token?: string | null
  }
  if (!res.ok || !j?.access_token) {
    await clearBiometricStoredCredentials()
    return false
  }

  setAuthTokens(String(j.access_token), j.refresh_token ? String(j.refresh_token) : null)

  try {
    await NativeBiometric.setCredentials({
      username: 'refresh_session',
      password: j.refresh_token ? String(j.refresh_token) : refresh,
      server: BIOMETRIC_CREDENTIAL_SERVER,
    })
  } catch {
    // rotation optional; session still works from localStorage
  }

  return true
}
