import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
]

/** Avoid stale HTML shell after deploy (PWA / aggressive CDN). Static assets keep long cache from Next. */
const documentCacheHeaders = [
  ...securityHeaders,
  { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/', headers: documentCacheHeaders },
      { source: '/me/:path*', headers: documentCacheHeaders },
      { source: '/admin/:path*', headers: documentCacheHeaders },
      { source: '/forgot-password', headers: documentCacheHeaders },
      { source: '/reset-password', headers: documentCacheHeaders },
      { source: '/auth/:path*', headers: documentCacheHeaders },
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig

