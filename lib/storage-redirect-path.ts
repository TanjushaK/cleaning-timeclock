/**
 * Защита от обхода пути (.., %2e%2e, пустые сегменты) в редиректах на public Storage.
 */
export function assertSafePublicStorageSegments(segments: string[]): Response | null {
  for (const raw of segments) {
    let s: string
    try {
      s = decodeURIComponent(String(raw ?? ''))
    } catch {
      return new Response('Invalid path', { status: 400 })
    }
    const t = s.trim()
    if (!t) return new Response('Invalid path', { status: 400 })
    if (t === '.' || t === '..') return new Response('Invalid path', { status: 400 })
    if (t.includes('/') || t.includes('\\')) return new Response('Invalid path', { status: 400 })
    if (t.length > 512) return new Response('Invalid path', { status: 400 })
  }
  return null
}
