/** Interpolate {{name}} placeholders (ASCII keys only). */
export function formatMsg(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k as keyof typeof vars]) : `{{${k}}}`
  )
}
