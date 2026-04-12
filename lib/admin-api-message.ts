/** Maps admin API `errorCode` values to message keys (`useI18n().t(adminApiErrKey(code))`). */
export function adminApiErrKey(errorCode: string): string {
  return `admin.api.${errorCode}`;
}
