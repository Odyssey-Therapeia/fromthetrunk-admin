import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { shouldRenderGtm, buildGtmSrc } from "@/lib/analytics/gtm";

import "../globals.css";
import { SiteFooterServer } from "@/components/layout/site-footer-server";
import { SiteHeaderServer } from "@/components/layout/site-header-server";
import { ThemeStyler } from "@/components/layout/theme-styler";
import { Providers } from "@/components/providers";
import { organizationJsonLd, safeJsonLd } from "@/lib/seo/json-ld";
import { getSiteOrigin } from "@/lib/config/site";

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

const baseUrl = getSiteOrigin();

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
    "theme-color": "#4b2626",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* P3-07: Inject active theme tokens as :root CSS custom-property overrides.
            When no theme is saved, ThemeStyler returns null and globals.css defaults apply. */}
        <ThemeStyler />
      </head>
      <body
        className="bg-background font-sans text-foreground"
        suppressHydrationWarning
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(organizationJsonLd()),
          }}
        />
        {/* Skip to content link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-primary focus:px-6 focus:py-3 focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Providers>
          <SiteHeaderServer />
          <main id="main-content" className="min-h-[70vh]" role="main">
            {children}
          </main>
          <SiteFooterServer />
        </Providers>
        <Analytics />
        <SpeedInsights />
        {shouldRenderGtm(process.env.NEXT_PUBLIC_GTM_ID) && (
          <Script
            strategy="afterInteractive"
            src={buildGtmSrc(process.env.NEXT_PUBLIC_GTM_ID!)}
          />
        )}
      </body>
    </html>
  );
}
