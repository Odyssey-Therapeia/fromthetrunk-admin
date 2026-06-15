/**
 * P3-08: BLOCK-09 spacer
 *
 * Configurable vertical spacer / divider. Provides explicit editorial control
 * over vertical rhythm between sections (no arbitrary px — Tailwind scale only).
 *
 * Size enum maps to standard Tailwind height classes:
 *   sm  → h-8   (2rem)
 *   md  → h-16  (4rem)
 *   lg  → h-24  (6rem)
 *   xl  → h-32  (8rem)
 *
 * showDivider renders an <hr> using --border token color.
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";

import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const spacerPropsSchema = z.object({
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  showDivider: z.boolean().default(false),
});

export type SpacerBlockProps = z.infer<typeof spacerPropsSchema>;

const heightClass: Record<string, string> = {
  sm: "h-8",
  md: "h-16",
  lg: "h-24",
  xl: "h-32",
};

function SpacerRenderer(props: Record<string, unknown>) {
  const p = props as SpacerBlockProps;
  const h = heightClass[p.size];

  return (
    <div className={`w-full ${h} flex items-center px-6`} aria-hidden="true">
      {p.showDivider && <hr className="w-full border-t border-border" />}
    </div>
  );
}

export const spacerBlock: BlockRegistryEntry = {
  type: "spacer",
  propsSchema: spacerPropsSchema,
  Renderer: SpacerRenderer,
  editorMeta: {
    label: "Spacer / Divider",
    icon: "separator-horizontal",
    // maxPerPage omitted = unlimited
  },
};
