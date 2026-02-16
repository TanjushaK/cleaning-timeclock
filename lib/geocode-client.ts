export type GeocodeOk = {
  ok: true;
  lat: number;
  lng: number;
  display_name?: string;
};

export type GeocodeFail = {
  ok: false;
  error: string;
};

export type GeocodeResult = GeocodeOk | GeocodeFail;

export async function geocodeAddress(q: string): Promise<GeocodeResult> {
  const query = (q || "").trim();
  if (!query) return { ok: false, error: "Пустой адрес" };

  try {
    const url = `/api/geocode?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { method: "GET" });

    const ct = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!ct.includes("application/json")) {
      return { ok: false, error: `Geocode: не-JSON (HTTP ${res.status})` };
    }

    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, error: "Geocode: JSON parse error" };
    }

    if (!res.ok) {
      return { ok: false, error: data?.error || `Geocode HTTP ${res.status}` };
    }

    if (!data?.ok) {
      return { ok: false, error: data?.error || "Geocode: неизвестная ошибка" };
    }

    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: "Geocode: невалидные координаты" };
    }

    return {
      ok: true,
      lat,
      lng,
      display_name: typeof data.display_name === "string" ? data.display_name : undefined,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Geocode: ошибка сети" };
  }
}
