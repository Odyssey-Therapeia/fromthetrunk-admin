/**
 * P3-09: RSC wrapper for SiteHeader.
 *
 * Fetches the managed header navigation from the navigation_menus table
 * and passes it to the client SiteHeader component.
 * Falls back to hardcoded defaults if the slot is empty or DB is unavailable.
 *
 * This is a React Server Component (no "use client") — it can use async/await
 * and the Drizzle adapter directly without bundling DB code to the client.
 */

import { SiteHeader } from "@/components/layout/site-header";
import { fetchHeaderNav } from "@/components/layout/nav-data";

export async function SiteHeaderServer() {
  const navLinks = await fetchHeaderNav();
  return <SiteHeader navLinks={navLinks} />;
}
