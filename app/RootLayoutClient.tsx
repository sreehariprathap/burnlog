"use client";
import { SWRConfig } from "swr";
import { Quicksand, Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
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
        className={`${quicksand.variable} ${figtree.variable} ${geistMono.variable} antialiased`}
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
                <ErrorBoundary>{children}</ErrorBoundary>
                <DevErrorWatcher />
                <GlobalErrorListener />
                <SwitchLoader />
                <Toaster
                  position="top-center"
                  gutter={8}
                  containerStyle={{ top: 'max(1rem, env(safe-area-inset-top))' }}
                  toastOptions={{ className: 'w-[calc(100vw-2rem)] max-w-sm' }}
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
