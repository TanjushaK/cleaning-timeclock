import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { chromium } from "@playwright/test";
import {
  APPLE_AUTH_DIR,
  APPLE_BASE_URL,
  APPLE_STORAGE_STATE_PATH,
} from "./apple-media-config.mjs";

async function waitForEnter(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await new Promise((resolve) => rl.question(prompt, () => resolve()));
  rl.close();
}

async function main() {
  const authDirPath = path.resolve(APPLE_AUTH_DIR);
  const storageStatePath = path.resolve(APPLE_STORAGE_STATE_PATH);
  await fs.mkdir(authDirPath, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Opening ${APPLE_BASE_URL} in Chromium...`);
  await page.goto(APPLE_BASE_URL, { waitUntil: "domcontentloaded" });
  console.log("After login, press Enter here to save auth state");
  await waitForEnter("> ");

  await context.storageState({ path: storageStatePath });
  await browser.close();
  console.log(`Auth state saved to: ${storageStatePath}`);
}

main().catch((error) => {
  console.error("Failed to save Apple auth state:", error.message);
  process.exitCode = 1;
});
