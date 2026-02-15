export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function isoDateToRu(iso?: string | null): string {
  if (!iso) return '';
  // expects YYYY-MM-DD
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

export function isoTimeToRu(t?: string | null): string {
  if (!t) return '';
  // expects HH:MM[:SS]
  const hh = t.slice(0, 2);
  const mm = t.slice(3, 5);
  if (!hh || !mm) return t;
  return `${hh}:${mm}`;
}

export function ruDateTimeFromIso(dateIso?: string | null, timeIso?: string | null): string {
  const d = isoDateToRu(dateIso);
  const t = isoTimeToRu(timeIso);
  if (!d && !t) return '';
  if (d && t) return `${d} ${t}`;
  return d || t;
}

export function metersDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
