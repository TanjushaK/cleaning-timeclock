import { NextResponse } from "next/server";
import { AppApiErrorCodes } from "@/lib/app-error-codes";
import { ApiError, requireUser, toErrorResponse } from "@/lib/route-db";

export async function PATCH(req: Request) {
  try {
    const { db, userId } = await requireUser(req);
    const body = await req.json();

    const avatar_url = body?.avatar_url ? String(body.avatar_url) : null;
    if (!avatar_url) throw new ApiError(400, "avatar_url required", AppApiErrorCodes.AVATAR_URL_REQUIRED);

    const { error } = await db.from("profiles").update({ avatar_url }).eq("id", userId);
    if (error) throw new ApiError(500, error.message, AppApiErrorCodes.AVATAR_URL_UPDATE_FAILED);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return toErrorResponse(e);
  }
}
