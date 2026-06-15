/**
 * P3-09: Navigation menu helpers consumed by SiteHeader and SiteFooter.
 *
 * getNavLinks() — returns managed header menu items from the navigation_menus table,
 *   falling back to DEFAULT_NAV_LINKS if the slot is empty or has no items.
 *
 * getFooterSections() — returns managed footer sections,
 *   falling back to DEFAULT_FOOTER_SECTIONS if the slot is empty or has no items.
 *
 * These functions are called in server components (RSC) so they use the
 * Drizzle query directly (lazily imported to keep tests DB-free).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type NavLink = {
  label: string;
  href: string;
};

export type FooterSection = {
  title: string;
  links: NavLink[];
};

// ── Defaults (match the original hardcoded values) ───────────────────────────

export const DEFAULT_NAV_LINKS: NavLink[] = [
  { href: "/collection", label: "Collection" },
  { href: "/our-story", label: "Our Story" },
  { href: "/why", label: "Our Why" },
  { href: "/how-it-works", label: "How It Works" },
];

export const DEFAULT_FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Explore",
    links: [
      { href: "/collection", label: "The Collection" },
      { href: "/our-story", label: "Our Story" },
      { href: "/how-it-works", label: "How It Works" },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { href: "/shipping-policy", label: "Shipping" },
      { href: "/packing", label: "Packing" },
      { href: "/return-policy", label: "Returns & Refunds" },
      { href: "/how-it-works", label: "Authentication" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms-of-service", label: "Terms of Service" },
    ],
  },
];

// ── Resolvers ─────────────────────────────────────────────────────────────────

/**
 * Fetches the managed header navigation links.
 * Falls back to DEFAULT_NAV_LINKS if the slot is empty or has no items.
 */
export async function getNavLinks(): Promise<NavLink[]> {
  const { dbSelectMenu } = await import("@/db/queries/content");
  const row = await dbSelectMenu("header");

  if (!row || !Array.isArray(row.items) || row.items.length === 0) {
    return DEFAULT_NAV_LINKS;
  }

  return row.items as NavLink[];
}

/**
 * Validates that a value is a valid FooterSection (has `title: string` and
 * `links: {label, href}[]`). Used to guard against malformed persisted data
 * (e.g. if the footer slot was saved with flat {label,href} items by mistake).
 */
function isFooterSection(item: unknown): item is FooterSection {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  if (typeof obj.title !== "string") return false;
  if (!Array.isArray(obj.links)) return false;
  return obj.links.every(
    (link) =>
      link &&
      typeof link === "object" &&
      typeof (link as Record<string, unknown>).label === "string" &&
      typeof (link as Record<string, unknown>).href === "string"
  );
}

/**
 * Fetches the managed footer navigation sections.
 * Falls back to DEFAULT_FOOTER_SECTIONS if the slot is empty, has no items,
 * or if the persisted items do not match the FooterSection shape
 * (defensive guard: prevents a bad/legacy row from crashing the root layout).
 */
export async function getFooterSections(): Promise<FooterSection[]> {
  const { dbSelectMenu } = await import("@/db/queries/content");
  const row = await dbSelectMenu("footer");

  if (!row || !Array.isArray(row.items) || row.items.length === 0) {
    return DEFAULT_FOOTER_SECTIONS;
  }

  // Defensive shape validation: if any item is not a valid FooterSection,
  // fall back to defaults rather than crashing the root layout.
  if (!row.items.every(isFooterSection)) {
    return DEFAULT_FOOTER_SECTIONS;
  }

  return row.items as FooterSection[];
}
