import { Analytics } from "@vercel/analytics/react";
import { Lato } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import { Providers } from "./providers";

import type { Metadata } from "next";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["100", "300", "400", "700", "900"],
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
  <html lang="en" className={`${lato.variable} h-full antialiased font-sans`}>
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
