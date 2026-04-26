import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  APPLE_BASE_URL,
  APPLE_SCREENSHOTS_DIR,
  APPLE_SCREENSHOT_SPECS,
  APPLE_STORAGE_STATE_PATH,
} from "./apple-media-config.mjs";

const SHOT_ROUTES = [
  { fileName: "01-login.png", route: "/" },
  { fileName: "02-worker-dashboard.png", route: "/" },
  { fileName: "03-jobs.png", route: "/" },
  { fileName: "04-profile.png", route: "/me" },
  { fileName: "05-privacy.png", route: "/privacy" },
  { fileName: "06-support.png", route: "/support" },
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    console.warn(`Route unavailable (${url}): ${error.message}`);
  }
}

async function main() {
  const storageStatePath = path.resolve(APPLE_STORAGE_STATE_PATH);
  const hasStorageState = await fileExists(storageStatePath);
  const browser = await chromium.launch({ headless: false });

  for (const spec of APPLE_SCREENSHOT_SPECS) {
    const outDir = path.resolve(APPLE_SCREENSHOTS_DIR, spec.key);
    await fs.mkdir(outDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
      storageState: hasStorageState ? storageStatePath : undefined,
    });
    const page = await context.newPage();

    for (const shot of SHOT_ROUTES) {
      const url = new URL(shot.route, APPLE_BASE_URL).toString();
      await safeGoto(page, url);
      const outPath = path.join(outDir, shot.fileName);
      await page.screenshot({
        path: outPath,
        fullPage: false,
      });
      console.log(`Saved ${outPath}`);
    }
    await context.close();
  }

  await browser.close();
}

main().catch((error) => {
  console.error("Failed to capture Apple screenshots:", error.message);
  process.exitCode = 1;
});
