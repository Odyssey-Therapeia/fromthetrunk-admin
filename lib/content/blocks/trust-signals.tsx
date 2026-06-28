/**
 * BLOCK-10: trust-signals
 *
 * Block-CMS equivalent of the hardcoded TrustSignals homepage section
 * (components/sections/trust-signals.tsx).
 *
 * Renders up to 3 trust stats:
 * each stat is an icon + value + label inside a bordered card.
 *
 * The icons are FIXED per slot (ShieldCheck, Users, Sparkles) to match the
 * original section exactly — only the value + label of each stat are editable.
 *
 * Draft-safe behavior:
 * - Empty stats are allowed while editing CMS drafts.
 * - Incomplete rows are ignored on render.
 * - If no complete stats exist, the block renders nothing instead of crashing.
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";
import { z } from "zod";

import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

const toMaxThreeArray = (value: unknown) =>
  Array.isArray(value) ? value.slice(0, 3) : [];

export const trustStatSchema = z.object({
  value: z.preprocess(emptyToUndefined, z.string().max(40).default("")),
  label: z.preprocess(emptyToUndefined, z.string().max(80).default("")),
});

export const trustSignalsPropsSchema = z.object({
  stats: z.preprocess(
    toMaxThreeArray,
    z.array(trustStatSchema).max(3).default([]),
  ),
});

export type TrustSignalsBlockProps = z.infer<typeof trustSignalsPropsSchema>;
export type TrustStat = z.infer<typeof trustStatSchema>;

// Icons are fixed per slot to match the original section markup exactly.
const STAT_ICONS: readonly LucideIcon[] = [ShieldCheck, Users, Sparkles];

function TrustSignalsRenderer(props: Record<string, unknown>) {
  const p = props as TrustSignalsBlockProps;
  const rawStats = Array.isArray(p.stats) ? p.stats : [];

  const visibleStats = rawStats
    .map((stat) => ({
      value: stat.value.trim(),
      label: stat.label.trim(),
    }))
    .filter((stat) => stat.value.length > 0 && stat.label.length > 0)
    .slice(0, 3);

  if (visibleStats.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <div className="grid gap-4 rounded-2xl border border-border/60 bg-card/70 p-5 shadow-soft md:grid-cols-3 md:p-6">
        {visibleStats.map((stat, index) => {
          const Icon = STAT_ICONS[index] ?? ShieldCheck;

          return (
            <div
              key={`${stat.value}-${stat.label}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/70 px-4 py-3"
            >
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-serif text-xl text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const trustSignalsBlock: BlockRegistryEntry = {
  type: "trust-signals",
  propsSchema: trustSignalsPropsSchema,
  Renderer: TrustSignalsRenderer,
  editorMeta: {
    label: "Trust Signals",
    icon: "shield-check",
    maxPerPage: 1,
  },
};
