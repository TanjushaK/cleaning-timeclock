export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string | null;
};

type NominatimItem = {
  lat: string;
  lon: string;
  display_name?: string;
};

export async function geocodeAddressViaNominatim(
  address: string,
  userAgent: string = "CleaningTimeclock/1.0 (admin geocoder)",
): Promise<GeocodeResult | null> {
  const query = String(address || "").trim();
  if (!query) return null;

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
    }).toString();

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const arr = (await res.json()) as NominatimItem[];
    const item = arr?.[0];
    if (!item?.lat || !item?.lon) return null;

    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      lat,
      lng,
      displayName: item.display_name ? String(item.display_name) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeRadius(radius: number | null | undefined): number {
  const n = Number(radius);
  return Number.isFinite(n) && n > 0 ? n : 150;
}

export function siteHasCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
  radius?: number | null | undefined,
): boolean {
  const hasLat = lat != null && Number.isFinite(Number(lat));
  const hasLng = lng != null && Number.isFinite(Number(lng));
  const hasRadius = radius == null ? true : Number.isFinite(Number(radius)) && Number(radius) > 0;
  return hasLat && hasLng && hasRadius;
}

export function siteCoordinatesMissingErrorMessage(): string {
  return "Site coordinates are required to start shifts. Check address/geocode and radius.";
}

export function siteAddressRequiredErrorMessage(): string {
  return "Address is required when coordinates are provided.";
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; display_name: string | null } | null> {
  const result = await geocodeAddressViaNominatim(address);
  if (!result) return null;
  return {
    lat: result.lat,
    lng: result.lng,
    display_name: result.displayName,
  };
}
