import { NextRequest } from "next/server";
import { GET as getWorker, PATCH as patchWorker } from "../workers/[id]/profile/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerIdFromReq(req: NextRequest): string {
  const fromQuery = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (fromQuery) return fromQuery;
  const pathname = req.nextUrl.pathname || "";
  const pretty = pathname.match(/^\/api\/admin\/workers\/([^/]+)\/profile$/);
  return pretty?.[1]?.trim() || "";
}

export async function GET(req: NextRequest) {
  const id = workerIdFromReq(req);
  return getWorker(req, { params: Promise.resolve({ id }) } as any);
}

export async function PATCH(req: NextRequest) {
  const id = workerIdFromReq(req);
  return patchWorker(req, { params: Promise.resolve({ id }) } as any);
}
