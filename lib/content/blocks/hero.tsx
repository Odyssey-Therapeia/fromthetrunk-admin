import { z } from "zod";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const heroPropsSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  headline: z.string().max(200),
  subtitle: z.string().max(400).optional(),
  backgroundImage: z.string().uuid().optional(),
  primaryCtaLabel: z.string().max(60).optional(),
  primaryCtaHref: z.string().max(300).optional(),
  secondaryCtaLabel: z.string().max(60).optional(),
  secondaryCtaHref: z.string().max(300).optional(),
  infoCardEyebrow: z.string().max(80).optional(),
  infoCardTitle: z.string().max(120).optional(),
  infoCardBody: z.string().max(300).optional(),
  minHeight: z.enum(["60vh", "80vh", "90vh", "100vh"]).default("90vh"),
});

export type HeroBlockProps = z.infer<typeof heroPropsSchema>;

function HeroRenderer(props: Record<string, unknown>) {
  const p = props as HeroBlockProps;
  const bgImageUrl = p.backgroundImage
    ? resolveMediaURL({ media: { url: p.backgroundImage } })
    : null;

  const minHeightClass: Record<string, string> = {
    "60vh": "min-h-[60vh]",
    "80vh": "min-h-[80vh]",
    "90vh": "min-h-[90vh]",
    "100vh": "min-h-screen",
  };

  return (
    <section
      className={`relative ${minHeightClass[p.minHeight]} overflow-hidden bg-trunk-brown text-white`}
    >
      <div className="absolute inset-0">
        {bgImageUrl ? (
          <Image
            src={bgImageUrl}
            alt={p.headline}
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-trunk-brown" />
        )}
        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/50 to-black/20" />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/20" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-32 md:pt-36">
        <div className="max-w-2xl space-y-6 drop-shadow-2xl">
          {p.eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
              {p.eyebrow}
            </p>
          )}
          <h1 className="font-serif text-4xl leading-tight tracking-wide text-white md:text-6xl">
            {p.headline}
          </h1>
          {p.subtitle && (
            <p className="max-w-xl text-lg leading-8 text-white/80 md:text-xl">
              {p.subtitle}
            </p>
          )}
        </div>

        {(p.primaryCtaLabel || p.secondaryCtaLabel) && (
          <div className="flex flex-wrap gap-4">
            {p.primaryCtaLabel && p.primaryCtaHref && (
              <Button
                asChild
                className="rounded-full px-8 py-6 text-sm transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
              >
                <Link href={p.primaryCtaHref}>{p.primaryCtaLabel}</Link>
              </Button>
            )}
            {p.secondaryCtaLabel && p.secondaryCtaHref && (
              <Button
                asChild
                variant="outline"
                className="rounded-full px-8 py-6 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
              >
                <Link href={p.secondaryCtaHref}>{p.secondaryCtaLabel}</Link>
              </Button>
            )}
          </div>
        )}

        {(p.infoCardEyebrow || p.infoCardTitle || p.infoCardBody) && (
          <div className="max-w-md">
            <div className="rounded-2xl border border-white/25 bg-white/15 p-6 text-sm text-amber-50/80 shadow-soft backdrop-blur-md">
              {p.infoCardEyebrow && (
                <p className="text-xs uppercase tracking-widest text-amber-100/60">
                  {p.infoCardEyebrow}
                </p>
              )}
              {p.infoCardTitle && (
                <p className="mt-3 font-serif text-xl text-white">
                  {p.infoCardTitle}
                </p>
              )}
              {p.infoCardBody && (
                <p className="mt-2 text-amber-100/70">{p.infoCardBody}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export const heroBlock: BlockRegistryEntry = {
  type: "hero",
  propsSchema: heroPropsSchema,
  Renderer: HeroRenderer,
  editorMeta: {
    label: "Hero",
    icon: "layout-panel-top",
    maxPerPage: 1,
  },
};
