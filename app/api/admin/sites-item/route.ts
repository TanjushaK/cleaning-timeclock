import { NextRequest } from "next/server";
import { GET as getSite, PUT as putSite, DELETE as deleteSite } from "../sites/[id]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getId(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  return id;
}

export async function GET(req: NextRequest) {
  const id = getId(req);
  return getSite(req as any, { params: Promise.resolve({ id }) } as any);
}

export async function PUT(req: NextRequest) {
  const id = getId(req);
  return putSite(req as any, { params: Promise.resolve({ id }) } as any);
}

export async function DELETE(req: NextRequest) {
  const id = getId(req);
  return deleteSite(req as any, { params: Promise.resolve({ id }) } as any);
}
