/**
 * P3-08: BLOCK-07 newsletter-signup
 *
 * RSC shell + client island pattern (D-B4 per block-inventory.md).
 * The Renderer is an RSC that passes serialisable props down to the
 * Newsletter client component. The form's handleSubmit POSTs to the
 * EXISTING endpoint: POST /api/v2/newsletter/subscribe
 * (api/hono/routes/newsletter.ts — rate-limited, returns { message,
 * requiresEmailConfirmation, subscribed }).
 *
 * The Newsletter component (components/sections/newsletter.tsx) currently
 * accepts no props and has hardcoded copy. This block wraps it in an RSC
 * section with the editable heading/eyebrow/body rendered server-side,
 * and the interactive form island rendered client-side below.
 *
 * propsSchema validated on SAVE and on RENDER (defense in depth via renderBlock).
 * Renderer: RSC shell, theme tokens only — no raw hex or arbitrary px.
 */

import { z } from "zod";

import { Newsletter } from "@/components/sections/newsletter";
import type { BlockRegistryEntry } from "@/lib/content/blocks/registry";

export const newsletterSignupPropsSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  heading: z.string().max(200),
  body: z.string().max(400).optional(),
  inputPlaceholder: z.string().max(80).default("Enter your email"),
  buttonLabel: z.string().max(60).default("Join the list"),
  background: z.enum(["card", "secondary", "transparent"]).default("card"),
});

export type NewsletterSignupBlockProps = z.infer<
  typeof newsletterSignupPropsSchema
>;

const bgClass: Record<string, string> = {
  card: "bg-card",
  secondary: "bg-secondary",
  transparent: "bg-transparent",
};

function NewsletterSignupRenderer(props: Record<string, unknown>) {
  const p = props as NewsletterSignupBlockProps;

  return (
    <section className={`w-full px-6 py-12 ${bgClass[p.background]}`}>
      <div className="mx-auto max-w-6xl">
        {/*
          Newsletter is a "use client" component. It handles:
            - email state + form submit
            - POST /api/v2/newsletter/subscribe  ← real existing endpoint
            - toast feedback + confirmation state
          All copy (eyebrow/heading/body) is passed from block props so the
          editor fields are authoritative — exactly ONE heading renders on the
          published page. inputPlaceholder and buttonLabel are also forwarded.
        */}
        <Newsletter
          eyebrow={p.eyebrow}
          heading={p.heading}
          body={p.body}
          inputPlaceholder={p.inputPlaceholder}
          buttonLabel={p.buttonLabel}
        />
      </div>
    </section>
  );
}

export const newsletterSignupBlock: BlockRegistryEntry = {
  type: "newsletter-signup",
  propsSchema: newsletterSignupPropsSchema,
  Renderer: NewsletterSignupRenderer,
  editorMeta: {
    label: "Newsletter Signup",
    icon: "mail",
    maxPerPage: 1,
  },
};
