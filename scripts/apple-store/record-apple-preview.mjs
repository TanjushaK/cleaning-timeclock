import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import {
  APPLE_BASE_URL,
  APPLE_STORAGE_STATE_PATH,
  APPLE_VIDEO_DIR,
  APPLE_VIDEO_RAW_DIR,
} from "./apple-media-config.mjs";

const execFileAsync = promisify(execFile);

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeGoto(page, route, waitMs) {
  const url = new URL(route, APPLE_BASE_URL).toString();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    console.warn(`Route unavailable (${url}): ${error.message}`);
  }
  await delay(waitMs);
}

async function isFfmpegAvailable() {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function convertToMp4(inputWebmPath, outputMp4Path) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputWebmPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputMp4Path,
  ]);
}

async function main() {
  const storageStatePath = path.resolve(APPLE_STORAGE_STATE_PATH);
  const hasStorageState = await fileExists(storageStatePath);
  const rawDir = path.resolve(APPLE_VIDEO_RAW_DIR);
  const videoDir = path.resolve(APPLE_VIDEO_DIR);
  const finalWebmPath = path.resolve(videoDir, "apple-preview-draft.webm");
  const finalMp4Path = path.resolve(videoDir, "apple-preview-draft.mp4");

  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1290, height: 2796 },
    deviceScaleFactor: 1,
    storageState: hasStorageState ? storageStatePath : undefined,
    recordVideo: { dir: rawDir, size: { width: 1290, height: 2796 } },
  });
  const page = await context.newPage();

  await safeGoto(page, "/", 3000);
  await safeGoto(page, "/me", 4000);
  await safeGoto(page, "/", 4000);
  await safeGoto(page, "/privacy", 4000);
  await safeGoto(page, "/support", 4000);

  const endCardHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .wrap { text-align: center; padding: 48px; }
    h1 { margin: 0 0 20px 0; font-size: 72px; line-height: 1.1; }
    p { margin: 0; font-size: 42px; opacity: 0.92; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Cleaning Timeclock</h1>
    <p>Workforce time tracking for cleaning teams</p>
  </div>
</body>
</html>`;
  await page.goto(`data:text/html,${encodeURIComponent(endCardHtml)}`, {
    waitUntil: "domcontentloaded",
  });
  await delay(3000);

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  await fs.copyFile(videoPath, finalWebmPath);
  console.log(`WebM saved: ${finalWebmPath}`);

  if (await isFfmpegAvailable()) {
    await convertToMp4(finalWebmPath, finalMp4Path);
    console.log(`MP4 saved: ${finalMp4Path}`);
  } else {
    console.log(
      "ffmpeg not found in PATH. WebM is ready; convert to MP4 on Mac or with ffmpeg."
    );
  }
}

main().catch((error) => {
  console.error("Failed to record Apple preview:", error.message);
  process.exitCode = 1;
});
