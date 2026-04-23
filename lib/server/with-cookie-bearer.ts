import type { NextRequest } from 'next/server'

/** Merge Bearer from `Authorization` header or HttpOnly cookie (admin UI + compat clients). */
export function withCookieBearer(req: NextRequest): Headers {
  const headers = new Headers(req.headers)
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const hasBearer = /^Bearer\s+.+/i.test(auth)
  if (!hasBearer) {
    const cookieToken = req.cookies.get('ct_access_token')?.value?.trim()
    if (cookieToken) headers.set('authorization', `Bearer ${cookieToken}`)
  }
  return headers
}
