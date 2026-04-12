/** Map JSON error payloads from admin APIs to localized UI strings. */

export function apiErrorMessage(
  t: (key: string, vars?: Record<string, string | number>) => string,
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
