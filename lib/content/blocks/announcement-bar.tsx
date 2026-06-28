/**
 * P3-08: BLOCK-08 announcement-bar
 *
 * Page-level announcement bar block. Supplementary to the layout-level
 * AnnouncementBar component (D-B3 per block-inventory.md) — does not replace
 * the hardcoded layout component. P3-10 decides global vs. per-page wiring.
 *
 * Renders an array of messages (rotating or static) with optional CTA link.
 * Background is configurable via enum mapping to theme tokens.
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";
import Link from "next/link";

import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

export const announcementBarPropsSchema = z.object({
  messages: z.array(z.string().max(200)).min(1).max(5),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(300).optional(),
  background: z.preprocess(
    emptyToUndefined,
    z.enum(["primary", "accent", "foreground"]).default("primary"),
  ),
});

export type AnnouncementBarBlockProps = z.infer<
  typeof announcementBarPropsSchema
>;

const themeMap: Record<
  string,
  { container: string; text: string; link: string }
> = {
  primary: {
    container: "bg-primary border-b border-primary-foreground/20",
    text: "text-primary-foreground",
    link: "text-primary-foreground underline decoration-primary-foreground/70 underline-offset-4 hover:opacity-90",
  },
  accent: {
    container: "bg-accent border-b border-accent-foreground/20",
    text: "text-accent-foreground",
    link: "text-accent-foreground underline decoration-accent-foreground/70 underline-offset-4 hover:opacity-90",
  },
  foreground: {
    container: "bg-foreground border-b border-background/20",
    text: "text-background",
    link: "text-background underline decoration-background/70 underline-offset-4 hover:opacity-90",
  },
};

function AnnouncementBarRenderer(props: Record<string, unknown>) {
  const p = props as AnnouncementBarBlockProps;
  const theme = themeMap[p.background] ?? themeMap.primary;

  return (
    <div className={`w-full px-3 py-2 text-center text-xs ${theme.container}`}>
      <p
        className={`mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 leading-4 tracking-[0.08em] uppercase ${theme.text}`}
      >
        {p.messages.map((msg, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="hidden sm:inline">
                •
              </span>
            )}
            {msg}
          </span>
        ))}
        {p.ctaLabel && p.ctaHref && (
          <>
            <span aria-hidden="true" className="hidden sm:inline">
              •
            </span>
            <Link
              href={p.ctaHref}
              className={`font-semibold transition ${theme.link}`}
            >
              {p.ctaLabel}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export const announcementBarBlock: BlockRegistryEntry = {
  type: "announcement-bar",
  propsSchema: announcementBarPropsSchema,
  Renderer: AnnouncementBarRenderer,
  editorMeta: {
    label: "Announcement Bar",
    icon: "megaphone",
    maxPerPage: 1,
    note: "Typically placed as the first block of a page template",
  },
};
