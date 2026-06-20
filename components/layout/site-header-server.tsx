/**
 * P3-09: RSC wrapper for SiteHeader.
 *
 * Keeps the header behind a server wrapper so layout code can stay server-first
 * while the interactive client header owns search, account, cart, and menu state.
 *
 * This is a React Server Component (no "use client") — it can use async/await
 * and the Drizzle adapter directly without bundling DB code to the client.
 */

import { SiteHeader } from "@/components/layout/site-header";

export async function SiteHeaderServer() {
  return <SiteHeader />;
}
