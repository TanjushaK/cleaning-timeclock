"use client";

import { Capacitor } from "@capacitor/core";

type NavigationTarget = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
};

function getCoords(target: NavigationTarget): { lat: number; lng: number } | null {
  const lat = Number(target.lat);
  const lng = Number(target.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function isIosPlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (Capacitor.getPlatform() === "ios") return true;
  } catch {
    // ignore
  }
  const ua = window.navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (window.navigator.maxTouchPoints || 0) > 1;
}

function isAndroidPlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (Capacitor.getPlatform() === "android") return true;
  } catch {
    // ignore
  }
  return /Android/i.test(window.navigator.userAgent || "");
}

function appleMapsHttpUrl(target: NavigationTarget): string | null {
  const coords = getCoords(target);
  if (coords) {
    const q = `${coords.lat},${coords.lng}`;
    return `https://maps.apple.com/?q=${encodeURIComponent(q)}&ll=${encodeURIComponent(q)}`;
  }
  const address = String(target.address || "").trim();
  if (!address) return null;
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}

function appleMapsNativeUrl(target: NavigationTarget): string | null {
  const coords = getCoords(target);
  if (coords) {
    const q = `${coords.lat},${coords.lng}`;
    return `maps://?q=${encodeURIComponent(q)}&ll=${encodeURIComponent(q)}`;
  }
  const address = String(target.address || "").trim();
  if (!address) return null;
  return `maps://?q=${encodeURIComponent(address)}`;
}

function googleMapsUrl(target: NavigationTarget): string | null {
  const coords = getCoords(target);
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coords.lat},${coords.lng}`)}`;
  }
  const address = String(target.address || "").trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function buildNavigationUrl(target: NavigationTarget): string | null {
  if (isIosPlatform()) return appleMapsHttpUrl(target);
  if (isAndroidPlatform()) return googleMapsUrl(target);
  return googleMapsUrl(target);
}

export function openNavigation(target: NavigationTarget): void {
  if (typeof window === "undefined") return;
  if (isIosPlatform()) {
    const primary = appleMapsNativeUrl(target);
    const fallback = appleMapsHttpUrl(target);
    if (!primary && !fallback) return;
    const popup = primary ? window.open(primary, "_blank", "noopener,noreferrer") : null;
    if (!popup && fallback) window.open(fallback, "_blank", "noopener,noreferrer");
    return;
  }

  const url = googleMapsUrl(target);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
