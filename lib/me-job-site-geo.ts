/**
 * Shared site geo for worker /api/me/jobs/start and /stop (avoid broken PostgREST embed under RLS).
 */

export const DEFAULT_CHECKIN_RADIUS_M = 150

export function toNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function normalizeSiteRow(raw: unknown): { lat: number; lng: number; radius: number } | null {
  if (raw == null) return null
  const row = Array.isArray(raw) ? raw[0] : raw
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const lat = toNum(o.lat)
  const lng = toNum(o.lng)
  const rad = toNum(o.radius)
  if (lat === null || lng === null) return null
  const radius = rad != null && rad > 0 ? rad : DEFAULT_CHECKIN_RADIUS_M
  return { lat, lng, radius }
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
