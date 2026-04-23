/**
 * Canonical international representation: digits only, no "+".
 * Aligns stored values like "31624937833" with input "+31624937833" or "06…" (NL national).
 */
export function canonicalPhoneDigits(input: string): string {
  let s = String(input ?? '').trim().replace(/[\s\-–—.\u00a0()]/g, '')
  if (s.startsWith('00')) s = s.slice(2)
  if (s.startsWith('+')) s = s.slice(1)
  let d = s.replace(/\D/g, '')
  if (!d) return ''
  // Netherlands mobile national: 06XXXXXXXX → 316XXXXXXXX
  if (d.length === 10 && d.startsWith('06')) {
    d = '31' + d.slice(2)
  }
  return d
}
