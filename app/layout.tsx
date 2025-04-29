"use client";
import { useState } from "react";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [supabaseClient] = useState(() => createPagesBrowserClient());

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/B.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF9E4F" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider defaultTheme="light" storageKey="burnlog-theme">
          <SessionContextProvider supabaseClient={supabaseClient}>
            {children}
            <Toaster />
          </SessionContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
