/**
 * P3-09: RSC wrapper for SiteFooter.
 *
 * Fetches the managed footer navigation sections from the navigation_menus table
 * and passes them to the client SiteFooter component.
 * Falls back to hardcoded defaults if the slot is empty or DB is unavailable.
 *
 * This is a React Server Component (no "use client") — it can use async/await
 * and the Drizzle adapter directly without bundling DB code to the client.
 */

import { SiteFooter } from "@/components/layout/site-footer";
import { fetchFooterSections } from "@/components/layout/nav-data";

export async function SiteFooterServer() {
  const footerSections = await fetchFooterSections();
  return <SiteFooter footerSections={footerSections} />;
}
