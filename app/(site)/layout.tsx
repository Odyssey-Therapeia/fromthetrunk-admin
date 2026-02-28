import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";

import "../globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Providers } from "@/components/providers";
import { organizationJsonLd } from "@/lib/seo/json-ld";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com";

export const metadata: Metadata = {
  title: {
    default: "From the Trunk | Pre-Loved Luxury Sarees",
    template: "%s | From the Trunk",
  },
  description:
    "Curated collection of authenticated, pre-loved luxury sarees. Each one-of-a-kind piece comes with provenance and a story woven in silk.",
  metadataBase: new URL(baseUrl),
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "From the Trunk",
    title: "From the Trunk | Pre-Loved Luxury Sarees",
    description:
      "Curated collection of authenticated, pre-loved luxury sarees. Each one-of-a-kind piece comes with provenance and a story woven in silk.",
  },
  twitter: {
    card: "summary_large_image",
    title: "From the Trunk | Pre-Loved Luxury Sarees",
    description:
      "Curated collection of authenticated, pre-loved luxury sarees.",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "theme-color": "#6b1d1d",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="bg-background font-sans text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd()),
          }}
        />
        {/* Skip to content link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-6 focus:py-3 focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main-content" className="min-h-[70vh]" role="main">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
