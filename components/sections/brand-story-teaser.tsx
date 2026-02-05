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
            The trunk that carries memories
          </h2>
          <p className="text-sm text-muted-foreground">
            From the Trunk began with a single cedar chest filled with heirloom
            sarees. Each piece whispered stories of celebrations, journeys, and
            women who wore them before. We now curate these treasures so their
            legacy can continue.
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
