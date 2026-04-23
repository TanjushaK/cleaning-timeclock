import { NextRequest, NextResponse } from "next/server";
import { LANG_STORAGE_KEY, parseLang, type Lang } from "@/lib/i18n-config";

const DEFAULT_ALLOW_HEADERS = "Authorization,Content-Type,X-Requested-With";
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function applyLangCookie(res: NextResponse, lang: Lang, req: NextRequest) {
  const secure = req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
  res.cookies.set(LANG_STORAGE_KEY, lang, {
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure,
  });
}

function applyCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  const reqHeaders = req.headers.get("access-control-request-headers");

  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", reqHeaders || DEFAULT_ALLOW_HEADERS);
  res.headers.set("Access-Control-Max-Age", "86400");

  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  } else {
    res.headers.set("Access-Control-Allow-Origin", "*");
  }
}

function rewriteIfNeeded(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;

  // Worker profile/photos have first-class dynamic routes at:
  // /api/admin/workers/[id]/profile and /api/admin/workers/[id]/photos.
  // Do not rewrite these paths to legacy compatibility endpoints in middleware,
  // because reverse-proxy forwarded https+localhost combinations can trigger
  // protocol mismatch proxying (EPROTO) for rewritten requests.

  const mSiteItem = pathname.match(/^\/api\/admin\/sites\/([^/]+)$/);
  if (mSiteItem && UUID_RE.test(mSiteItem[1])) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/admin/sites-item";
    url.searchParams.set("id", mSiteItem[1]);
    return NextResponse.rewrite(url);
  }

  // Site photos also have a first-class dynamic route at:
  // /api/admin/sites/[id]/photos.
  // Keep this path direct to avoid proxy protocol mismatch behind reverse proxy
  // (EPROTO from https->localhost rewrite hop).

  return null;
}

/**
 * Единая точка: локаль `?lang=` (страницы) + CORS/rewrite для `/api/*`.
 */
export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    const raw = req.nextUrl.searchParams.get("lang");
    const lang = raw ? parseLang(raw) : null;
    if (lang) {
      const url = req.nextUrl.clone();
      url.searchParams.delete("lang");
      const res = NextResponse.redirect(url);
      applyLangCookie(res, lang, req);
      return res;
    }
    return NextResponse.next();
  }

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    applyCors(req, res);
    return res;
  }

  const rewritten = rewriteIfNeeded(req);
  if (rewritten) {
    applyCors(req, rewritten);
    return rewritten;
  }

  const res = NextResponse.next();
  applyCors(req, res);
  return res;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|webmanifest)$).*)",
  ],
};
