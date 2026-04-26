export const APPLE_SCREENSHOT_SPECS = [
  { key: "iphone-6-7", width: 1290, height: 2796 },
  { key: "iphone-6-5", width: 1242, height: 2688 },
  { key: "iphone-5-5", width: 1242, height: 2208 },
  { key: "ipad-12-9", width: 2048, height: 2732 },
];

export const APPLE_BASE_URL =
  process.env.APPLE_MEDIA_BASE_URL?.trim() || "http://127.0.0.1:3000";

export const APPLE_MEDIA_ROOT = "marketing/apple-store";
export const APPLE_AUTH_DIR = `${APPLE_MEDIA_ROOT}/.auth`;
export const APPLE_STORAGE_STATE_PATH = `${APPLE_AUTH_DIR}/storage-state.json`;
export const APPLE_SCREENSHOTS_DIR = `${APPLE_MEDIA_ROOT}/screenshots`;
export const APPLE_VIDEO_DIR = `${APPLE_MEDIA_ROOT}/video`;
export const APPLE_VIDEO_RAW_DIR = `${APPLE_VIDEO_DIR}/raw`;
