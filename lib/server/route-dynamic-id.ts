import type { NextRequest } from 'next/server'

type ParamSource = Record<string, string | string[] | undefined>

function pathnameFromReq(req: NextRequest | { url: string }): string {
  const nu = (req as NextRequest)?.nextUrl
  if (nu?.pathname) return nu.pathname
  try {
    return new URL((req as { url: string }).url).pathname
  } catch {
    return ''
  }
}

async function unwrapRouteParams(rawContext: unknown): Promise<ParamSource | null> {
  let ctx: unknown = rawContext
  if (ctx !== null && ctx !== undefined && typeof (ctx as Promise<unknown>).then === 'function') {
    ctx = await (ctx as Promise<{ params?: unknown }>)
  }
  if (!ctx || typeof ctx !== 'object') return null

  let p = (ctx as { params?: unknown }).params
  if (p !== null && p !== undefined && typeof (p as Promise<unknown>).then === 'function') {
    p = await (p as Promise<ParamSource>)
  }
  if (!p || typeof p !== 'object') return null
  return p as ParamSource
}

/** When `context.params` is empty (observed with some Next.js App Router builds), infer UUID from URL. */
function fallbackIdFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  const w = parts.indexOf('workers')
  if (w >= 0 && parts[w + 1]) return parts[w + 1]
  const s = parts.indexOf('sites')
  if (s >= 0 && parts[s + 1]) return parts[s + 1]
  const j = parts.indexOf('jobs')
  if (j >= 0 && parts[j + 1]) return parts[j + 1]
  return ''
}

/**
 * Resolves dynamic `[id]` for admin route handlers.
 * Supports both `{ params: Promise<{ id }> }` and a promised outer context object.
 */
export async function routeDynamicId(
  req: NextRequest | { url: string },
  rawContext: unknown,
  key = 'id'
): Promise<string> {
  const params = await unwrapRouteParams(rawContext)
  const v = params?.[key]
  const fromParams =
    typeof v === 'string'
      ? v.trim()
      : Array.isArray(v) && typeof v[0] === 'string'
        ? v[0].trim()
        : ''
  if (fromParams) return fromParams

  return fallbackIdFromPath(pathnameFromReq(req)).trim()
}
