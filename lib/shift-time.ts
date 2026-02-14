export function hhmm(v?: string | null) {
  if (!v) return null
  const m = /^(\d{2}):(\d{2})/.exec(v)
  return m ? `${m[1]}:${m[2]}` : null
}

export function addMinutesToHHMM(start: string | null, minutes: number | null) {
  const s = start ? hhmm(start) : null
  if (!s || minutes == null || !Number.isFinite(minutes)) return null
  const [h, m] = s.split(':').map(Number)
  const total = h * 60 + m + Math.max(0, Math.round(minutes))
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formatRange(start: string | null, minutes: number | null) {
  const s = hhmm(start) || '—'
  const e = addMinutesToHHMM(start, minutes) || '—'
  return `${s}–${e}`
}

export function plannedHours(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return null
  return Math.round((minutes / 60) * 100) / 100
}
