"use client";
import { SWRConfig } from "swr";
import {
  Quicksand, Figtree, Geist_Mono, Poppins, Inter,
  Krona_One, Prata, Lexend, Calistoga, Mulish,
  Work_Sans, Bevan, Fraunces, Archivo, Righteous, Arimo,
} from "next/font/google";
import { TypographySettingsEffect } from "@/components/adminlog/TypographySettingsEffect";
import { AppThemeSettingsEffect } from "@/components/adminlog/AppThemeSettingsEffect";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { GlobalErrorListener } from "@/components/GlobalErrorListener";
import { ThemeProvider } from "@/components/ThemeProvider";
import PWAInstall from "@/components/PWAInstall";
import PWAStatus from "@/components/PWAStatus";
import PWAUpdateNotification from "@/components/PWAUpdateNotification";
import SplashScreen from "@/components/SplashScreen";
import { KeyboardFocusScroll } from "@/components/KeyboardFocusScroll";
import { AppSwitchProvider } from "@/lib/appSwitchContext";
import { PaymentProvider } from "@/lib/moneylog/paymentContext";
import { SwitchLoader } from "@/components/SwitchLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DevErrorWatcher } from "@/components/DevErrorWatcher";
import { OfflineBanner } from "@/components/OfflineBanner";
import { TestModeBanner } from "@/components/adminlog/TestModeBanner";
import { AnnouncementBanners } from "@/components/AnnouncementBanners";
import { EnableNotificationsPrompt } from "@/components/EnableNotificationsPrompt";

// Quicksand: page/section headings app-wide. Figtree: default body/UI text.
// Momo Trust Display (the TopBar title font) isn't in next/font/google's
// bundled font list yet, so it's loaded via a plain <link> below instead.
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Admin-selectable alternates (AdminLog > UI > Typography) — always loaded
// so switching the setting doesn't need a page reload to fetch a new font,
// but only actually applied (via TypographySettingsEffect, which flips
// --font-quicksand/--font-figtree to point at one of these) once an admin
// picks something other than the defaults above.
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// AdminLog > UI > Typography's expanded font catalog (see lib/typography.ts)
// — always loaded so switching the setting doesn't need a page reload.
// Fonts Google only ships as one static weight get `weight: "400"`;
// variable fonts get `weight: "variable"` so CSS font-weight (used by the
// admin's weight control) works across the full range from one file.
const kronaOne = Krona_One({ variable: "--font-krona-one", weight: "400", subsets: ["latin"] });
const prata = Prata({ variable: "--font-prata", weight: "400", subsets: ["latin"] });
const lexend = Lexend({ variable: "--font-lexend", weight: "variable", subsets: ["latin"] });
const calistoga = Calistoga({ variable: "--font-calistoga", weight: "400", subsets: ["latin"] });
const mulish = Mulish({ variable: "--font-mulish", weight: "variable", subsets: ["latin"] });
const workSans = Work_Sans({ variable: "--font-work-sans", weight: "variable", subsets: ["latin"] });
const bevan = Bevan({ variable: "--font-bevan", weight: "400", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", weight: "variable", subsets: ["latin"] });
const archivo = Archivo({ variable: "--font-archivo", weight: "variable", subsets: ["latin"] });
const righteous = Righteous({ variable: "--font-righteous", weight: "400", subsets: ["latin"] });
const arimo = Arimo({ variable: "--font-arimo", weight: "variable", subsets: ["latin"] });

const TYPOGRAPHY_FONT_VARIABLES = [
  kronaOne.variable, prata.variable, lexend.variable, calistoga.variable, mulish.variable,
  workSans.variable, bevan.variable, fraunces.variable, archivo.variable, righteous.variable, arimo.variable,
].join(" ");

export default function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#3b82f6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LogBook" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#3b82f6" />
        <meta name="msapplication-tap-highlight" content="no" />

        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" sizes="180x180" />
        <link rel="shortcut icon" href="/icons/icon-192.png" />
        <link rel="manifest" href="/manifest.webmanifest" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Momo+Trust+Display&display=swap" rel="stylesheet" />

        <title>LogBook</title>
        <meta name="description" content="Your daily digest across every app you track life with — fitness, money, tasks, home, social, shopping, and travel, all in one place." />
      </head>
      <body
        className={`${quicksand.variable} ${figtree.variable} ${geistMono.variable} ${poppins.variable} ${inter.variable} ${TYPOGRAPHY_FONT_VARIABLES} antialiased`}
        suppressHydrationWarning
      >
        <SWRConfig
          value={{
            revalidateOnFocus: true,
            revalidateIfStale: true,
            dedupingInterval: 3000,
            keepPreviousData: true,
          }}
        >
          <ThemeProvider defaultTheme="light" storageKey="burnlog-theme">
            <AppSwitchProvider>
              <PaymentProvider>
                <SplashScreen />
                <KeyboardFocusScroll />
                <OfflineBanner />
                <TestModeBanner />
                <AnnouncementBanners />
                <ErrorBoundary>{children}</ErrorBoundary>
                <DevErrorWatcher />
                <GlobalErrorListener />
                <TypographySettingsEffect />
                <AppThemeSettingsEffect />
                <SwitchLoader />
                <ToastContainer
                  position="top-center"
                  closeButton={false}
                  hideProgressBar
                  icon={false}
                  // Strip react-toastify's own visual theme (background,
                  // padding, radius, shadow, min-height) — use-toast.tsx's
                  // renderToast() supplies 100% of the visible chrome, this
                  // just needs to get out of the way of it.
                  toastClassName="!m-0 !min-h-0 !max-h-none !w-[calc(100vw-2rem)] !max-w-sm !bg-transparent !p-0 !shadow-none"
                  style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
                  toastStyle={{ marginBottom: 8 }}
                />
                <PWAInstall />
                <PWAStatus />
                <PWAUpdateNotification />
                <EnableNotificationsPrompt />
              </PaymentProvider>
            </AppSwitchProvider>
          </ThemeProvider>
        </SWRConfig>
      </body>
    </html>
  );
}
