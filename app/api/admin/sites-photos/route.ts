import { NextRequest } from "next/server";
import { GET as getPhotos, POST as postPhotos, DELETE as deletePhoto } from "../sites/[id]/photos/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return getPhotos(req, { params: Promise.resolve({ id }) } as any);
}

export async function POST(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return postPhotos(req, { params: Promise.resolve({ id }) } as any);
}

export async function DELETE(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return deletePhoto(req, { params: Promise.resolve({ id }) } as any);
}
