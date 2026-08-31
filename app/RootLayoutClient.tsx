"use client";
import { useState } from "react";
import { SWRConfig } from "swr";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import PWAInstall from "@/components/PWAInstall";
import PWAStatus from "@/components/PWAStatus";
import PWAUpdateNotification from "@/components/PWAUpdateNotification";
import SplashScreen from "@/components/SplashScreen";
import { AppSwitchProvider } from "@/lib/appSwitchContext";
import { SwitchLoader } from "@/components/SwitchLoader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
  const [supabaseClient] = useState(() => createPagesBrowserClient());

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#3b82f6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="burnlog" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#3b82f6" />
        <meta name="msapplication-tap-highlight" content="no" />

        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icons/icon-180.png" sizes="180x180" />
        <link rel="shortcut icon" href="/icons/icon-192.png" />
        <link rel="manifest" href="/manifest.webmanifest" />

        <title>burnlog - Fitness Tracker</title>
        <meta name="description" content="Track your workouts, set fitness goals, and monitor your progress" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
            <SessionContextProvider supabaseClient={supabaseClient}>
              <AppSwitchProvider>
                <SplashScreen />
                <OfflineBanner />
                <ErrorBoundary>{children}</ErrorBoundary>
                <SwitchLoader />
                <Toaster />
                <PWAInstall />
                <PWAStatus />
                <PWAUpdateNotification />
              </AppSwitchProvider>
            </SessionContextProvider>
          </ThemeProvider>
        </SWRConfig>
      </body>
    </html>
  );
}
