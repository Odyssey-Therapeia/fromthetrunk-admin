import type { Metadata } from "next";
import { draftMode } from "next/headers";
import Image from "next/image";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Card } from "@/components/ui/card";
import { getGlobals } from "@/lib/data/products";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";

const storyHero =
  "https://images.unsplash.com/photo-1727430228383-aa1fb59db8bf?q=80&w=2200&auto=format&fit=crop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Born in Bengaluru from a single question: Why let beautiful sarees fade away in dark trunks? At FTT, we breathe new life into preloved gems — bridging the gap between vintage charm and modern luxury.",
};

export default function OurStoryPage() {
  return <OurStoryPageContent />;
}

async function OurStoryPageContent() {
  const { isEnabled: includeDrafts } = await draftMode();
  const ourStoryPage = await getGlobals("ourStoryPage", { includeDrafts });
  const textOrFallback = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback;
  const heroImage = resolveMediaURL(ourStoryPage?.heroImage) ?? storyHero;

  const cards = [
    {
      title: textOrFallback(ourStoryPage?.cardOneTitle, "Sourcing"),
      description:
        textOrFallback(
          ourStoryPage?.cardOneBody,
          "We give new life to preloved sarees sourced directly from homes."
        ),
    },
    {
      title: textOrFallback(ourStoryPage?.cardTwoTitle, "Quality Control"),
      description:
        textOrFallback(
          ourStoryPage?.cardTwoBody,
          "A rigorous 360\u00B0 check for tears, spills, and material integrity."
        ),
    },
    {
      title: textOrFallback(ourStoryPage?.cardThreeTitle, "Eco-Restoration"),
      description:
        textOrFallback(
          ourStoryPage?.cardThreeBody,
          "Conscious cleaning and artisanal mending that respects the fabric."
        ),
    },
  ];

  return (
    <div className="space-y-16 pb-20">
      <section className="relative min-h-[60vh] overflow-hidden">
        <Image
          src={heroImage}
          alt="Heirloom sarees folded inside a trunk"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-luxury-fade" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-16 pt-32 text-white">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.5em] text-amber-100/70">
              {textOrFallback(ourStoryPage?.heroEyebrow, "Our Story")}
            </p>
            <h1 className="font-serif text-4xl md:text-6xl">
              {textOrFallback(ourStoryPage?.heroTitle, "Born in Bengaluru, rooted in heritage")}
            </h1>
          </ScrollReveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl space-y-10 px-6">
        <ScrollReveal className="space-y-4">
          <h2 className="font-serif text-3xl text-foreground">
            {textOrFallback(ourStoryPage?.sectionTitle, "Our Trunk Journey")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {textOrFallback(
              ourStoryPage?.sectionBody,
              "Born in Bengaluru from a single question: Why let beautiful sarees fade away in dark trunks? At FTT, we breathe new life into preloved gems. By sourcing forgotten treasures and meticulously restoring them to their original glory, we bridge the gap between vintage charm and modern luxury. We believe in a world where quality isn't just bought, it's preserved."
            )}
          </p>
        </ScrollReveal>

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((item) => (
            <Card
              key={item.title}
              className="h-full border-border/60 bg-card/70 p-6 shadow-soft"
            >
              <h3 className="font-serif text-xl text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl space-y-6 px-6">
        <ScrollReveal className="space-y-6">
          <h2 className="font-serif text-3xl text-foreground">
            Why we do what we do
          </h2>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              There&apos;s something quietly powerful about a saree. It carries
              more than fabric &mdash; it holds memories, milestones, and
              moments that once meant everything.
            </p>
            <p>
              In so many homes, these beautiful pieces lie tucked away,
              preserved but forgotten.
            </p>
            <p>
              From the Trunk was born from a simple, heartfelt belief: these
              sarees still have stories left to tell.
            </p>
            <p>
              By giving your pre-loved sarees a second life, you&apos;re not
              just clearing space &mdash; you&apos;re passing on heritage,
              emotion, and craftsmanship. Each saree becomes a bridge between
              past and present, finding new meaning in someone else&apos;s
              journey.
            </p>
            <p>
              And in doing so, you&apos;re also making a conscious, sustainable
              choice &mdash; reducing waste while celebrating timeless fashion.
            </p>
            <p className="font-serif text-base text-foreground">
              At From the Trunk, we don&apos;t just collect sarees.
              <br />
              We honor them.
              <br />
              We preserve their stories.
              <br />
              And we help them be loved all over again.
            </p>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
