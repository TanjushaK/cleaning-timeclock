import { FetchApiError } from "@/lib/fetch-api-error";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function messageFromApiPayload(
  t: TFn,
  payload: { error?: string; errorCode?: string },
): string {
  const code = payload.errorCode;
  if (code) {
    const key = `errors.api.${code}`;
    const m = t(key);
    if (m !== key) return m;
  }
  return payload.error || t("error.generic");
}

export function clientApiErrorMessage(t: TFn, e: unknown): string {
  if (e instanceof FetchApiError) {
    return messageFromApiPayload(t, { error: e.message, errorCode: e.errorCode });
  }
  return String((e as Error)?.message ?? e);
}

/**
 * Worker UI: JSON API errors (`errorCode` → `errors.api.*`) plus legacy `{ code }` payloads
 * → `errors.identity.*`.
 */
export function clientWorkerErrorMessage(t: TFn, e: unknown): string {
  if (e instanceof FetchApiError) {
    return messageFromApiPayload(t, { error: e.message, errorCode: e.errorCode });
  }
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code) {
      const key = `errors.identity.${code}`;
      const m = t(key);
      if (m !== key) return m;
    }
  }
  if (e instanceof Error && e.message) return e.message;
  return t("error.generic");
}
