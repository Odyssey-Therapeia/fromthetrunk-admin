/**
 * P3-08: BLOCK-05 story-editorial
 *
 * Multi-beat editorial narrative section. Each beat can have paragraphs, an
 * optional image, and a layout variant. Optional climax lines and a CTA.
 * No GSAP in v1 — static render. Animation is progressive enhancement (P3+).
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 *
 * Draft-safe behavior:
 * - Empty beats are allowed while editing.
 * - Empty paragraph rows are ignored on render.
 * - Old saved media UUIDs are ignored instead of being passed into next/image.
 */

import { z } from "zod";
import Image from "next/image";
import Link from "next/link";

import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

const toArray = (value: unknown) => (Array.isArray(value) ? value : []);

const normalizeBeatLayout = (value: unknown) => {
  if (
    value === "image-right" ||
    value === "image-left" ||
    value === "text-only-dark" ||
    value === "full-bleed"
  ) {
    return value;
  }

  return undefined;
};

const getSafeImageSrc = (value: unknown) => {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const resolved = resolveMediaURL({ media: { url: trimmed } });
  if (!resolved) return undefined;

  if (
    resolved.startsWith("/") ||
    resolved.startsWith("http://") ||
    resolved.startsWith("https://")
  ) {
    return resolved;
  }

  return undefined;
};

export const beatSchema = z.object({
  paragraphs: z.preprocess(
    toArray,
    z.array(z.string().max(600)).max(4).default([]),
  ),
  image: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
  imageAlt: z.string().max(200).optional(),
  layout: z.preprocess(
    normalizeBeatLayout,
    z
      .enum(["image-right", "image-left", "text-only-dark", "full-bleed"])
      .default("image-right"),
  ),
});

export const storyEditorialPropsSchema = z.object({
  beats: z.preprocess(toArray, z.array(beatSchema).max(6).default([])),
  climaxLines: z.preprocess(
    toArray,
    z.array(z.string().max(200)).max(6).default([]),
  ),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(300).optional(),
});

export type StoryEditorialBlockProps = z.infer<
  typeof storyEditorialPropsSchema
>;
export type BeatProps = z.infer<typeof beatSchema>;

function Beat({ beat }: { beat: BeatProps }) {
  const imageUrl = getSafeImageSrc(beat.image);
  const paragraphs = beat.paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (paragraphs.length === 0) {
    return null;
  }

  const isTextOnlyDark = beat.layout === "text-only-dark";
  const isFullBleed = beat.layout === "full-bleed";
  const isImageLeft = beat.layout === "image-left";

  if (isTextOnlyDark || (isFullBleed && !imageUrl)) {
    return (
      <div className="bg-foreground px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          {paragraphs.map((para, i) => (
            <p
              key={`${para}-${i}`}
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
          {paragraphs.map((para, i) => (
            <p
              key={`${para}-${i}`}
              className="font-serif text-xl leading-relaxed text-background md:text-2xl"
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6 py-12 md:flex-row md:gap-16 ${
        isImageLeft ? "md:flex-row" : "md:flex-row-reverse"
      }`}
    >
      <div className="w-full flex-1 space-y-5">
        {paragraphs.map((para, i) => (
          <p
            key={`${para}-${i}`}
            className="font-sans text-base leading-relaxed text-muted-foreground"
          >
            {para}
          </p>
        ))}
      </div>

      {imageUrl ? (
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
      ) : null}
    </div>
  );
}

function StoryEditorialRenderer(props: Record<string, unknown>) {
  const p = props as StoryEditorialBlockProps;

  const visibleBeats = p.beats.filter((beat) =>
    beat.paragraphs.some((paragraph) => paragraph.trim().length > 0),
  );

  const visibleClimaxLines = p.climaxLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (
    visibleBeats.length === 0 &&
    visibleClimaxLines.length === 0 &&
    !(p.ctaLabel && p.ctaHref)
  ) {
    return null;
  }

  return (
    <section className="w-full overflow-hidden">
      {visibleBeats.map((beat, i) => (
        <Beat key={`story-beat-${i}`} beat={beat} />
      ))}

      {visibleClimaxLines.length > 0 ? (
        <div className="bg-foreground px-6 py-20">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            {visibleClimaxLines.map((line, i) => (
              <p
                key={`${line}-${i}`}
                className="font-serif text-2xl leading-relaxed text-background md:text-3xl"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {p.ctaLabel && p.ctaHref ? (
        <div className="flex justify-center px-6 py-10">
          <Link
            href={p.ctaHref}
            className="rounded-full border border-border px-8 py-3 text-sm text-foreground transition hover:bg-muted"
          >
            {p.ctaLabel}
          </Link>
        </div>
      ) : null}
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
