import { NextResponse } from "next/server";

/** Standard API error JSON: English `error` + stable `errorCode` for UI mapping. */
export function jsonApiError(
  status: number,
  errorCode: string,
  messageEn: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: messageEn, errorCode, ...extra }, { status });
}
