import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { requireAdmin, toErrorResponse } from "@/lib/route-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  country_code?: string;
};

type NominatimItem = {
  osm_type?: string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
};

function splitHouseNumber(value: string | undefined): { number: string | null; addition: string | null } {
  const raw = String(value || "").trim();
  if (!raw) return { number: null, addition: null };
  const match = /^(\d+)\s*(.*)$/.exec(raw);
  if (!match) return { number: raw, addition: null };
  return {
    number: match[1] || null,
    addition: String(match[2] || "").trim() || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const ip = clientIpFromRequest(req);
    if (!checkRateLimit(`geocode:admin:suggest:${ip}`, 30, 60_000)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const q = String(req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 3) {
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    const userAgent =
      process.env.NOMINATIM_USER_AGENT ||
      "Tanija Cleaning Timeclock (admin address suggestions); contact=admin@tanjusha.nl";

    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q,
        format: "jsonv2",
        addressdetails: "1",
        countrycodes: "nl",
        limit: "5",
        dedupe: "1",
      }).toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
          "Accept-Language": "nl,en;q=0.9,ru;q=0.8",
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json({ error: `geocode_http_${response.status}` }, { status: 502 });
    }

    const raw = (await response.json()) as NominatimItem[];
    const seen = new Set<string>();
    const suggestions = [] as Array<{
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
    }>;

    for (const item of Array.isArray(raw) ? raw : []) {
      const lat = Number(item?.lat);
      const lng = Number(item?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const address = item.address || {};
      const street = String(address.road || address.pedestrian || address.footway || address.cycleway || "").trim() || null;
      const house = splitHouseNumber(address.house_number);
      const postalCode = String(address.postcode || "").trim() || null;
      const city = String(address.city || address.town || address.village || address.municipality || "").trim() || null;
      const province = String(address.state || "").trim() || null;
      const country = String(address.country || "Nederland").trim() || "Nederland";

      const houseText = [house.number, house.addition].filter(Boolean).join("");
      const streetLine = [street, houseText].filter(Boolean).join(" ").trim();
      const cityLine = [postalCode, city].filter(Boolean).join(" ").trim();
      const formattedAddress =
        [streetLine, cityLine, country].filter(Boolean).join(", ") || String(item.display_name || "").trim();
      if (!formattedAddress) continue;

      const dedupeKey = `${formattedAddress.toLowerCase()}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      suggestions.push({
        id: `${item.osm_type || "place"}:${item.osm_id || `${lat},${lng}`}`,
        street,
        house_number: house.number,
        house_number_addition: house.addition,
        postal_code: postalCode,
        city,
        province,
        country,
        country_code: "NL",
        formatted_address: formattedAddress,
        lat,
        lng,
      });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 5) }, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
