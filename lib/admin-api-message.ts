import { NextResponse } from "next/server";

/** Maps admin API `errorCode` values to message keys (`useI18n().t(adminApiErrKey(code))`). */
export function adminApiErrKey(errorCode: string): string {
  return `admin.api.${errorCode}`;
}

/** Standard JSON error body for admin routes that do not use `ApiError` + `toErrorResponse`. */
export function adminJsonError(status: number, errorCode: string, messageEn: string) {
  return NextResponse.json({ errorCode, error: messageEn }, { status });
}
