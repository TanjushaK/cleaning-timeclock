import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

function truthy(v: string | undefined | null) {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

/** Метка сборки для PWA: env на сервере или хэш из `.next/BUILD_ID` после `next build`. */
function buildLabel(): string {
  const fromEnv =
    process.env.DEPLOY_SHA || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA;
  if (fromEnv) {
    const s = String(fromEnv).replace(/\s/g, "");
    if (s.length >= 7) return s.slice(0, 7);
    if (s.length) return s;
  }
  try {
    const p = join(process.cwd(), ".next", "BUILD_ID");
    if (existsSync(p)) {
      const id = readFileSync(p, "utf8").trim();
      if (id) return id.slice(0, 7);
    }
  } catch {
    // ignore
  }
  return "local";
}

export const runtime = "nodejs";

export async function GET() {
  const enabledEnv = process.env.PWA_SW_ENABLED;
  const killEnv = process.env.PWA_SW_KILL;

  // SAFE DEFAULT: disabled unless explicitly enabled.
  const enabled = truthy(enabledEnv);
  const kill = truthy(killEnv);

  const build = buildLabel();

  const res = NextResponse.json({ enabled, kill, build });

  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}
