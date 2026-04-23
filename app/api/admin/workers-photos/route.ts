import { NextRequest } from "next/server";
import { GET as getPhotos, POST as postPhotos, DELETE as deletePhoto } from "../workers/[id]/photos/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerIdFromReq(req: NextRequest): string {
  const fromQuery = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (fromQuery) return fromQuery;

  const pathname = req.nextUrl.pathname || "";
  const pretty = pathname.match(/^\/api\/admin\/workers\/([^/]+)\/photos$/);
  if (pretty?.[1]) return pretty[1];

  return "";
}

export async function GET(req: NextRequest) {
  const id = workerIdFromReq(req);
  return getPhotos(req, { params: Promise.resolve({ id }) } as any);
}

export async function POST(req: NextRequest) {
  const id = workerIdFromReq(req);
  return postPhotos(req, { params: Promise.resolve({ id }) } as any);
}

export async function DELETE(req: NextRequest) {
  const id = workerIdFromReq(req);
  return deletePhoto(req, { params: Promise.resolve({ id }) } as any);
}
