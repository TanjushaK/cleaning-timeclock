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

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

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
  matcher: ["/api/:path*"],
};
