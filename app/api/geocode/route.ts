import { NextRequest } from "next/server";

export const runtime = "nodejs";

type NominatimItem = {
  lat: string;
  lon: string;
  display_name?: string;
};

function getUserAgent() {
  const ua = process.env.NOMINATIM_USER_AGENT?.trim();
  // Nominatim просит валидный UA (лучше с контактом/домены).
  return ua && ua.length > 0 ? ua : "Tanija-Cleaning-Timeclock/1.0 (contact: admin@tanija.local)";
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) {
      return Response.json({ ok: false, error: "Параметр q обязателен" }, { status: 400 });
    }

    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=" +
      encodeURIComponent(q);

    const res = await fetch(url, {
      headers: {
        "User-Agent": getUserAgent(),
        "Accept": "application/json",
        "Accept-Language": "ru,en;q=0.8",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return Response.json(
        { ok: false, error: `Nominatim HTTP ${res.status}`, details: txt.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = (await res.json()) as NominatimItem[];
    if (!Array.isArray(data) || data.length === 0) {
      return Response.json({ ok: false, error: "Адрес не найден" }, { status: 404 });
    }

    const item = data[0];
    const lat = Number(item.lat);
    const lng = Number(item.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ ok: false, error: "Невалидные координаты от Nominatim" }, { status: 502 });
    }

    return Response.json({
      ok: true,
      q,
      display_name: item.display_name ?? null,
      lat,
      lng,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
