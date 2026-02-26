import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEnabled(v: string | undefined): boolean {
  if (!v) return true;
  const s = String(v).trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no" || s === "disabled") return false;
  return true;
}

export async function GET() {
  const enabled = parseEnabled(process.env.PWA_SW_ENABLED);
  return NextResponse.json(
    { enabled, ts: Date.now() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
