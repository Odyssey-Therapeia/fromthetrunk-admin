/**
 * P3-08: BLOCK-05 story-editorial
 *
 * Multi-beat editorial narrative section. Each beat can have paragraphs, an
 * optional image, and a layout variant. Optional climax lines and a CTA.
 * No GSAP in v1 — static render. Animation is progressive enhancement (P3+).
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";
import Image from "next/image";
import Link from "next/link";

import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const beatSchema = z.object({
  paragraphs: z.array(z.string().max(600)).min(1).max(4),
  image: z.string().uuid().optional(),
  imageAlt: z.string().max(200).optional(),
  layout: z.enum([
    "image-right",
    "image-left",
    "text-only-dark",
    "full-bleed",
  ]),
});

export const storyEditorialPropsSchema = z.object({
  beats: z.array(beatSchema).min(1).max(6),
  climaxLines: z.array(z.string().max(200)).max(6).optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(300).optional(),
});

export type StoryEditorialBlockProps = z.infer<
  typeof storyEditorialPropsSchema
>;
export type BeatProps = z.infer<typeof beatSchema>;

function Beat({ beat }: { beat: BeatProps }) {
  const imageUrl = beat.image
    ? resolveMediaURL({ media: { url: beat.image } })
    : null;

  const isTextOnlyDark = beat.layout === "text-only-dark";
  const isFullBleed = beat.layout === "full-bleed";
  const isImageLeft = beat.layout === "image-left";

  if (isTextOnlyDark) {
    return (
      <div className="bg-foreground px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          {beat.paragraphs.map((para, i) => (
            <p
              key={i}
              className="font-serif text-xl leading-relaxed text-background md:text-2xl"
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (isFullBleed && imageUrl) {
    return (
      <div className="relative min-h-96 overflow-hidden">
        <Image
          src={imageUrl}
          alt={beat.imageAlt ?? ""}
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-foreground/60" />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
          {beat.paragraphs.map((para, i) => (
            <p
              key={i}
              className="font-serif text-xl leading-relaxed text-background md:text-2xl"
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // image-right or image-left (split layout)
  return (
    <div
      className={`mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 py-12 md:flex-row md:gap-16 ${
        isImageLeft ? "md:flex-row" : "md:flex-row-reverse"
      }`}
    >
      <div className="w-full flex-1 space-y-5">
        {beat.paragraphs.map((para, i) => (
          <p
            key={i}
            className="font-sans text-base leading-relaxed text-muted-foreground"
          >
            {para}
          </p>
        ))}
      </div>
      {imageUrl && (
        <div className="w-full flex-1">
          <div className="relative aspect-square overflow-hidden rounded-3xl shadow-soft">
            <Image
              src={imageUrl}
              alt={beat.imageAlt ?? ""}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StoryEditorialRenderer(props: Record<string, unknown>) {
  const p = props as StoryEditorialBlockProps;

  return (
    <section className="w-full overflow-hidden">
      {p.beats.map((beat, i) => (
        <Beat key={i} beat={beat} />
      ))}

      {p.climaxLines && p.climaxLines.length > 0 && (
        <div className="bg-foreground px-6 py-20">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            {p.climaxLines.map((line, i) => (
              <p
                key={i}
                className="font-serif text-2xl leading-relaxed text-background md:text-3xl"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {p.ctaLabel && p.ctaHref && (
        <div className="flex justify-center px-6 py-10">
          <Link
            href={p.ctaHref}
            className="rounded-full border border-border px-8 py-3 text-sm text-foreground transition hover:bg-muted"
          >
            {p.ctaLabel}
          </Link>
        </div>
      )}
    </section>
  );
}

export const storyEditorialBlock: BlockRegistryEntry = {
  type: "story-editorial",
  propsSchema: storyEditorialPropsSchema,
  Renderer: StoryEditorialRenderer,
  editorMeta: {
    label: "Story / Editorial",
    icon: "book-open",
    maxPerPage: 1,
  },
};
