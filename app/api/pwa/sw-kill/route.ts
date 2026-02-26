import { NextResponse } from "next/server";

function truthy(v: string | undefined | null) {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const runtime = "nodejs";

export async function GET() {
  const enabledEnv = process.env.PWA_SW_ENABLED;
  const killEnv = process.env.PWA_SW_KILL;

  // SAFE DEFAULT: disabled unless explicitly enabled.
  const enabled = truthy(enabledEnv);
  const kill = truthy(killEnv);

  const build =
    (process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : undefined) ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "local";

  const res = NextResponse.json({ enabled, kill, build });

  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}
