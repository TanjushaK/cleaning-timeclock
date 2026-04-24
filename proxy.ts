import { NextRequest, NextResponse } from "next/server";
import { LANG_STORAGE_KEY, parseLang, type Lang } from "@/lib/i18n-config";

const DEFAULT_ALLOW_HEADERS = "Authorization,Content-Type,X-Requested-With";

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
