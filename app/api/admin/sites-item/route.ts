import { NextRequest } from "next/server";
import { GET as getSite, PUT as putSite, PATCH as patchSite, DELETE as deleteSite } from "../sites/[id]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return getSite(req, { params: Promise.resolve({ id }) } as any);
}

export async function PUT(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return putSite(req, { params: Promise.resolve({ id }) } as any);
}

export async function PATCH(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return patchSite(req, { params: Promise.resolve({ id }) } as any);
}

export async function DELETE(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return deleteSite(req, { params: Promise.resolve({ id }) } as any);
}
