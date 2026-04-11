import I18nProvider from "@/components/I18nProvider";
import LanguageSwitch from "@/components/LanguageSwitch";
import AutoTranslate from "@/components/AutoTranslate";
import "./globals.css";
import "./app-theme.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_STORAGE_KEY, parseLang } from "@/lib/i18n-config";
import ClientSessionWarmup from "@/lib/client-session-warmup";
import SWRegister from "@/app/sw-register";
import CapacitorBridge from "@/components/CapacitorBridge";

const inter = Inter({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F59E0B",
};

export const metadata: Metadata = {
  title: "Van Tanija BV Cleaning • Timeclock",
  description: "Van Tanija BV Cleaning — Cleaning Timeclock",
  icons: { icon: "/tanija-logo.png", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Timeclock",
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
    url: false,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const htmlLang = parseLang(jar.get(LANG_STORAGE_KEY)?.value) ?? DEFAULT_LANG;

  return (
    <html lang={htmlLang}>
      <body className={inter.className}>
        <ClientSessionWarmup />
        <CapacitorBridge />
        <SWRegister />
        <I18nProvider>
          <LanguageSwitch />
          <AutoTranslate />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
