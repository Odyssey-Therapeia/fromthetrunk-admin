/**
 * P3-08: BLOCK-03 image-text-split
 *
 * Side-by-side image + rich text, with configurable image position and background.
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";
import Image from "next/image";
import Link from "next/link";

import { sanitizeCmsHtml } from "@/lib/content/sanitize-html";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const imageTextSplitPropsSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(200),
  body: z.string().max(2000),
  image: z.string().uuid(),
  imageAlt: z.string().max(200).optional(),
  imagePosition: z.enum(["left", "right"]).default("right"),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(300).optional(),
  background: z
    .enum(["transparent", "secondary", "muted"])
    .default("transparent"),
});

export type ImageTextSplitBlockProps = z.infer<
  typeof imageTextSplitPropsSchema
>;

const bgClass: Record<string, string> = {
  transparent: "bg-transparent",
  secondary: "bg-secondary",
  muted: "bg-muted",
};

function ImageTextSplitRenderer(props: Record<string, unknown>) {
  const p = props as ImageTextSplitBlockProps;
  const imageUrl = resolveMediaURL({ media: { url: p.image } });
  const isImageLeft = p.imagePosition === "left";

  return (
    <section className={`w-full py-16 ${bgClass[p.background]}`}>
      <div
        className={`mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 md:flex-row md:gap-16 ${
          isImageLeft ? "md:flex-row" : "md:flex-row-reverse"
        }`}
      >
        {/* Image column */}
        <div className="w-full flex-1">
          {imageUrl ? (
            <div className="relative aspect-square overflow-hidden rounded-3xl shadow-soft">
              <Image
                src={imageUrl}
                alt={p.imageAlt ?? p.heading}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="aspect-square rounded-3xl bg-muted" />
          )}
        </div>

        {/* Text column */}
        <div className="w-full flex-1 space-y-6">
          {p.eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {p.eyebrow}
            </p>
          )}
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            {p.heading}
          </h2>
          <div
            className="prose prose-neutral max-w-none font-sans text-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(p.body) }}
          />
          {p.ctaLabel && p.ctaHref && (
            <Link
              href={p.ctaHref}
              className="inline-block rounded-full border border-border px-6 py-2 text-sm text-foreground transition hover:bg-muted"
            >
              {p.ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export const imageTextSplitBlock: BlockRegistryEntry = {
  type: "image-text-split",
  propsSchema: imageTextSplitPropsSchema,
  Renderer: ImageTextSplitRenderer,
  editorMeta: {
    label: "Image + Text",
    icon: "layout-panel-left",
    // maxPerPage omitted = unlimited
  },
};
