"use client";

export type GeocodeOk = {
  ok: true;
  q: string;
  display_name: string | null;
  lat: number;
  lng: number;
};

export type GeocodeFail = {
  ok: false;
  error: string;
  details?: string;
};

export async function geocodeAddress(q: string): Promise<GeocodeOk> {
  const url = `/api/geocode?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });

  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    let payload: GeocodeFail | null = null;
    if (ct.includes("application/json")) {
      try {
        payload = JSON.parse(text);
      } catch {}
    }
    throw new Error(payload?.error || `Geocode HTTP ${res.status}`);
  }

  if (!ct.includes("application/json")) {
    throw new Error("Geocode: ожидался JSON, пришёл не-JSON");
  }

  const data = JSON.parse(text) as GeocodeOk | GeocodeFail;
  if (!data.ok) throw new Error(data.error);

  return data;
}
