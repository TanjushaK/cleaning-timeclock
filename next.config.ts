import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
];

const noStoreHeaders = [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [...securityHeaders, ...noStoreHeaders],
      },
      {
        source: "/manifest.webmanifest",
        headers: [...securityHeaders, ...noStoreHeaders],
      },
      {
        source: "/apple-touch-icon.png",
        headers: [...securityHeaders, ...noStoreHeaders],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
