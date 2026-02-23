import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ALLOW_HEADERS = "Authorization,Content-Type,X-Requested-With";

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

  const mProfile = pathname.match(/^\/api\/admin\/workers\/([^/]+)\/profile$/);
  if (mProfile) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/admin/workers-profile";
    url.searchParams.set("id", mProfile[1]);
    return NextResponse.rewrite(url);
  }

  const mPhotos = pathname.match(/^\/api\/admin\/workers\/([^/]+)\/photos$/);
  if (mPhotos) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/admin/workers-photos";
    url.searchParams.set("id", mPhotos[1]);
    return NextResponse.rewrite(url);
  }

  return null;
}

export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

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
  matcher: ["/api/:path*"],
};
