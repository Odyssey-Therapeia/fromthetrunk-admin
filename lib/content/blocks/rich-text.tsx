import { z } from "zod";

import { sanitizeCmsHtml } from "@/lib/content/sanitize-html";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const richTextPropsSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(200).optional(),
  body: z.string().max(8000),
  align: z.enum(["left", "center"]).default("left"),
  maxWidth: z.enum(["prose", "wide", "full"]).default("prose"),
});

export type RichTextBlockProps = z.infer<typeof richTextPropsSchema>;

const maxWidthClass: Record<string, string> = {
  prose: "max-w-prose",
  wide: "max-w-4xl",
  full: "max-w-full",
};

function RichTextRenderer(props: Record<string, unknown>) {
  const p = props as RichTextBlockProps;
  const alignClass = p.align === "center" ? "text-center mx-auto" : "text-left";
  const widthClass = maxWidthClass[p.maxWidth];

  return (
    <section className="w-full px-6 py-12">
      <div className={`${widthClass} ${alignClass}`}>
        {p.eyebrow && (
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {p.eyebrow}
          </p>
        )}
        {p.heading && (
          <h2 className="mb-6 font-serif text-3xl text-foreground md:text-4xl">
            {p.heading}
          </h2>
        )}
        <div
          className="prose prose-neutral max-w-none font-sans text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(p.body) }}
        />
      </div>
    </section>
  );
}

export const richTextBlock: BlockRegistryEntry = {
  type: "rich-text",
  propsSchema: richTextPropsSchema,
  Renderer: RichTextRenderer,
  editorMeta: {
    label: "Rich Text",
    icon: "text",
    // maxPerPage omitted = unlimited
  },
};
