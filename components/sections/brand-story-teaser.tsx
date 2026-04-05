import Image from "next/image";
import Link from "next/link";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Button } from "@/components/ui/button";

const storyImage =
  "https://images.unsplash.com/photo-1679006831648-7c9ea12e5807?q=80&w=2000&auto=format&fit=crop";

export function BrandStoryTeaser() {
  return (
    <section className="bg-secondary/50 py-16">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ScrollReveal className="space-y-6">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Our Story
          </p>
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            Born in Bengaluru, rooted in heritage
          </h2>
          <p className="text-sm text-muted-foreground">
            Why let beautiful sarees fade away in dark trunks? At FTT, we
            breathe new life into preloved gems. By sourcing forgotten treasures
            and meticulously restoring them to their original glory, we bridge
            the gap between vintage charm and modern luxury. We believe in a
            world where quality isn&apos;t just bought, it&apos;s preserved.
          </p>
          <Button asChild className="rounded-full px-8">
            <Link href="/our-story">Read the full story</Link>
          </Button>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-soft">
            <Image
              src={storyImage}
              alt="Vintage trunk with silk textiles"
              fill
              className="object-cover"
            />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
