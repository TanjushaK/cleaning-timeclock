import { NextRequest } from "next/server";
import { GET as getWorker, PATCH as patchWorker } from "../workers/[id]/profile/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return getWorker(req, { params: Promise.resolve({ id }) } as any);
}

export async function PATCH(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return patchWorker(req, { params: Promise.resolve({ id }) } as any);
}
