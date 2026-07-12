import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { requireAdmin, toErrorResponse } from "@/lib/route-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddressSuggestion = {
  id: string;
  street: string | null;
  house_number: string | null;
  house_number_addition: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  country_code: "NL";
  formatted_address: string;
  lat: number;
  lng: number;
  geocode_provider: "pdok" | "nominatim";
};

type PdokDoc = {
  id?: string;
  weergavenaam?: string;
  straatnaam?: string;
  huisnummer?: number | string;
  huisletter?: string;
  huisnummertoevoeging?: string;
  postcode?: string;
  woonplaatsnaam?: string;
  provincienaam?: string;
  centroide_ll?: string;
};

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  footway?: string;
  cycleway?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
};

type NominatimItem = {
  osm_type?: string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
};

function text(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

function coordinatesFromPoint(value: unknown): { lat: number; lng: number } | null {
  const match = /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec(String(value || ""));
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function splitHouseNumber(value: unknown): { number: string | null; addition: string | null } {
  const raw = text(value);
  if (!raw) return { number: null, addition: null };
  const match = /^(\d+)\s*(.*)$/.exec(raw);
  return match
    ? { number: match[1] || null, addition: text(match[2]) }
    : { number: raw, addition: null };
}

function queryVariants(query: string): string[] {
  const values: string[] = [];
  const add = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized && !values.includes(normalized)) values.push(normalized);
  };

  add(query);
  add(query.replace(/(\d)([A-Za-z])\b/g, "$1 $2"));
  add(query.replace(/(\d+)\s*[A-Za-z](?=\s*(?:,|$))/g, "$1"));
  return values;
}

function requestedHouse(query: string): { number: string | null; addition: string | null } {
  const streetLine = query.split(",", 1)[0]?.trim() || query.trim();
  const match = /(\d+)\s*([A-Za-z0-9\-\/]*)\s*$/.exec(streetLine);
  return match
    ? { number: match[1] || null, addition: text(match[2])?.toUpperCase() || null }
    : { number: null, addition: null };
}

function suggestionScore(item: AddressSuggestion, requested: ReturnType<typeof requestedHouse>): number {
  if (!requested.number) return 0;
  if (item.house_number !== requested.number) return 0;

  const actualAddition = text(item.house_number_addition)?.toUpperCase() || null;
  if (!requested.addition) return actualAddition ? 80 : 100;
  if (actualAddition === requested.addition) return 150;
  if (!actualAddition) return 100;
  return 60;
}

function dedupeSuggestions(items: AddressSuggestion[], query?: string): AddressSuggestion[] {
  const requested = requestedHouse(query || "");
  const sorted = [...items].sort((a, b) => suggestionScore(b, requested) - suggestionScore(a, requested));
  const seen = new Set<string>();
  return sorted.filter((item) => {
    const key = `${item.formatted_address.toLowerCase()}|${item.lat.toFixed(6)}|${item.lng.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`geocode_http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchPdok(query: string): Promise<AddressSuggestion[]> {
  const output: AddressSuggestion[] = [];
  for (const q of queryVariants(query)) {
    const url = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?" + new URLSearchParams({
      q,
      fq: "type:adres",
      rows: "10",
      fl: "id,weergavenaam,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam,provincienaam,centroide_ll",
    }).toString();
    const json = await fetchJson(url) as { response?: { docs?: PdokDoc[] } };
    for (const doc of json?.response?.docs || []) {
      const point = coordinatesFromPoint(doc.centroide_ll);
      if (!point) continue;
      const houseNumber = text(doc.huisnummer);
      const addition = [text(doc.huisletter), text(doc.huisnummertoevoeging)].filter(Boolean).join("") || null;
      const street = text(doc.straatnaam);
      const postalCode = text(doc.postcode);
      const city = text(doc.woonplaatsnaam);
      const streetLine = [street, [houseNumber, addition].filter(Boolean).join("")].filter(Boolean).join(" ");
      const cityLine = [postalCode, city].filter(Boolean).join(" ");
      const formattedAddress = [streetLine, cityLine, "Nederland"].filter(Boolean).join(", ") || text(doc.weergavenaam);
      if (!formattedAddress) continue;
      output.push({
        id: `pdok:${doc.id || `${point.lat},${point.lng}`}`,
        street,
        house_number: houseNumber,
        house_number_addition: addition,
        postal_code: postalCode,
        city,
        province: text(doc.provincienaam),
        country: "Nederland",
        country_code: "NL",
        formatted_address: formattedAddress,
        lat: point.lat,
        lng: point.lng,
        geocode_provider: "pdok",
      });
    }
  }
  return dedupeSuggestions(output, query);
}

async function searchNominatim(query: string): Promise<AddressSuggestion[]> {
  const userAgent = process.env.NOMINATIM_USER_AGENT ||
    "Tanija Cleaning Timeclock (admin address suggestions); contact=admin@tanjusha.nl";
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "nl",
    limit: "5",
    dedupe: "1",
  }).toString();
  const raw = await fetchJson(url, {
    "User-Agent": userAgent,
    "Accept-Language": "nl,en;q=0.9,ru;q=0.8",
  }) as NominatimItem[];
  const output: AddressSuggestion[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const address = item.address || {};
    const street = text(address.road || address.pedestrian || address.footway || address.cycleway);
    const house = splitHouseNumber(address.house_number);
    const postalCode = text(address.postcode);
    const city = text(address.city || address.town || address.village || address.municipality);
    const streetLine = [street, [house.number, house.addition].filter(Boolean).join("")].filter(Boolean).join(" ");
    const cityLine = [postalCode, city].filter(Boolean).join(" ");
    const formattedAddress = [streetLine, cityLine, "Nederland"].filter(Boolean).join(", ") || text(item.display_name);
    if (!formattedAddress) continue;
    output.push({
      id: `nominatim:${item.osm_type || "place"}:${item.osm_id || `${lat},${lng}`}`,
      street,
      house_number: house.number,
      house_number_addition: house.addition,
      postal_code: postalCode,
      city,
      province: text(address.state),
      country: text(address.country) || "Nederland",
      country_code: "NL",
      formatted_address: formattedAddress,
      lat,
      lng,
      geocode_provider: "nominatim",
    });
  }
  return dedupeSuggestions(output);
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const ip = clientIpFromRequest(req);
    if (!checkRateLimit(`geocode:admin:suggest:${ip}`, 30, 60_000)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const q = String(req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 3) return NextResponse.json({ suggestions: [] }, { status: 200 });

    let suggestions: AddressSuggestion[] = [];
    try {
      suggestions = await searchPdok(q);
    } catch (error) {
      console.warn("[geocode] PDOK failed", error);
    }
    if (suggestions.length === 0) {
      try {
        suggestions = await searchNominatim(q);
      } catch (error) {
        console.warn("[geocode] Nominatim failed", error);
      }
    }
    return NextResponse.json({ suggestions }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
