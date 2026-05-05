import { Analytics } from "@vercel/analytics/react";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter } from "next/font/google";
import Script from "next/script";

import { cn } from "@/lib/utils";

import "./globals.css";
import { Providers } from "./providers";

import type { Metadata } from "next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Pookie",
  description: "the cutest AI agent for your Slack workspace",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => (
  <html
    lang="en"
    className={cn(
      "h-full antialiased font-sans",
      inter.variable,
      geistSans.variable,
      geistMono.variable,
    )}
  >
    <head>
      {process.env.NODE_ENV === "development" && (
        <Script
          src="//unpkg.com/react-grab/dist/index.global.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      )}
    </head>
    <body className="flex min-h-full flex-col">
      <Providers>{children}</Providers>
      <Analytics />
    </body>
  </html>
);

export default RootLayout;
