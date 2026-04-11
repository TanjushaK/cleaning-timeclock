type Bucket = { count: number; resetAt: number }

const store = new Map<string, Bucket>()

const PRUNE_EVERY = 200
let ops = 0

function prune(now: number) {
  for (const [k, b] of store) {
    if (now > b.resetAt + 120_000) store.delete(k)
  }
}

/**
 * Простой лимит по IP для одного процесса Node (VPS). Не подходит для кластера без общего хранилища.
 * @returns true если запрос разрешён
 */
export function checkRateLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now()
  if (++ops % PRUNE_EVERY === 0) prune(now)

  const b = store.get(key)
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= maxPerWindow) return false
  b.count += 1
  return true
}

export function clientIpFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first.slice(0, 128)
  }
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp.slice(0, 128)
  return 'unknown'
}
