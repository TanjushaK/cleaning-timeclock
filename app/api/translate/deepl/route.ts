import { NextResponse } from "next/server";
import {
  deeplTranslateBatch,
  getDeepLAuthKey,
  langToDeepLTarget,
} from "@/lib/deepl";
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit";
import { isLang, type Lang } from "@/lib/i18n-config";

const POST_WINDOW_MS = 60_000;
const POST_MAX_PER_WINDOW = 40;

type Body = {
  texts?: unknown;
  target_lang?: unknown;
};

export async function GET() {
  return NextResponse.json({ enabled: Boolean(getDeepLAuthKey()) });
}

export async function POST(req: Request) {
  if (!getDeepLAuthKey()) {
    return NextResponse.json(
      { error: "DeepL is not configured (set DEEPL_AUTH_KEY on the server)" },
      { status: 503 },
    );
  }

  const ip = clientIpFromRequest(req);
  if (!checkRateLimit(`deepl-translate:${ip}`, POST_MAX_PER_WINDOW, POST_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const textsRaw = body.texts;
  const targetRaw = body.target_lang;

  if (!Array.isArray(textsRaw) || typeof targetRaw !== "string") {
    return NextResponse.json({ error: "Expected { texts: string[], target_lang: string }" }, { status: 400 });
  }

  if (!isLang(targetRaw)) {
    return NextResponse.json({ error: "Invalid target_lang" }, { status: 400 });
  }

  const targetLang = targetRaw as Lang;
  const deeplTarget = langToDeepLTarget(targetLang);
  if (!deeplTarget) {
    return NextResponse.json({ error: "target_lang must be uk, en, or nl" }, { status: 400 });
  }

  const texts = textsRaw
    .map((t) => (typeof t === "string" ? t : ""))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (texts.length === 0) {
    return NextResponse.json({ translations: [] });
  }

  if (texts.length > 50) {
    return NextResponse.json({ error: "Max 50 strings per request" }, { status: 400 });
  }

  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  if (totalChars > 120_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }

  try {
    const { translations } = await deeplTranslateBatch(texts, deeplTarget);
    return NextResponse.json({ translations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DeepL error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
