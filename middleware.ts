import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-ct-lang", "");
  return res;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
