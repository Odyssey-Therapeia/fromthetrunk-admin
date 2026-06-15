/**
 * P3-08: BLOCK-06 faq
 *
 * FAQ accordion block. Renders a list of Q&A items as an accordion, and
 * emits a FAQPage JSON-LD script tag for schema.org structured data.
 *
 * JSON-LD safety: uses safeJsonLd() from lib/seo/json-ld.ts which
 * unicode-escapes `<` so `</script>` cannot close the enclosing script tag
 * (same pattern as productJsonLd on PDPs — proven by block-faq-json-ld.test.ts).
 *
 * Rich text in answers is sanitized via sanitizeCmsHtml before rendering as
 * HTML. The answer text in the JSON-LD uses the raw answer string (not HTML)
 * so sanitizeCmsHtml is not applied there — safeJsonLd handles escaping.
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";

import { sanitizeCmsHtml } from "@/lib/content/sanitize-html";
import { safeJsonLd } from "@/lib/seo/json-ld";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const faqItemSchema = z.object({
  question: z.string().max(300),
  answer: z.string().max(2000),
});

export const faqPropsSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(200).optional(),
  items: z.array(faqItemSchema).min(1).max(20),
});

export type FaqBlockProps = z.infer<typeof faqPropsSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;

function buildFaqPageJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function FaqRenderer(props: Record<string, unknown>) {
  const p = props as FaqBlockProps;
  const jsonLd = buildFaqPageJsonLd(p.items);

  return (
    <section className="w-full px-6 py-12">
      {/* FAQPage JSON-LD — safeJsonLd escapes < to < preventing </script> injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <div className="mx-auto max-w-3xl">
        {p.eyebrow && (
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {p.eyebrow}
          </p>
        )}
        {p.heading && (
          <h2 className="mb-8 font-serif text-3xl text-foreground md:text-4xl">
            {p.heading}
          </h2>
        )}

        <div className="space-y-4">
          {p.items.map((item, i) => (
            <details
              key={i}
              className="group rounded-lg border border-border bg-card"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-4 font-sans text-sm font-medium text-foreground">
                {item.question}
                <span
                  className="shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <div
                className="prose prose-neutral max-w-none border-t border-border px-6 py-4 font-sans text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: sanitizeCmsHtml(item.answer),
                }}
              />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export const faqBlock: BlockRegistryEntry = {
  type: "faq",
  propsSchema: faqPropsSchema,
  Renderer: FaqRenderer,
  editorMeta: {
    label: "FAQ",
    icon: "message-circle-question",
    // maxPerPage omitted = unlimited
  },
};
