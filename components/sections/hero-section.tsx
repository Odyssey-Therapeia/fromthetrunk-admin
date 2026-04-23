"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Button } from "@/components/ui/button";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";

const fallbackHeroImage = "/media/home-cover.png";
const heroBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwMCIgaGVpZ2h0PSI5MDAiIHZpZXdCb3g9IjAgMCAxNjAwIDkwMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYwMCIgaGVpZ2h0PSI5MDAiIGZpbGw9IiMzRDJCMUYiLz48cmVjdCB3aWR0aD0iMTYwMCIgaGVpZ2h0PSI5MDAiIGZpbGw9InVybCgjZ3JhZCkiIGZpbGwtb3BhY2l0eT0iMC43NSIvPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iZ3JhZCIgeDE9IjAiIHkxPSIwIiB4Mj0iMTYwMCIgeTI9IjkwMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIHN0b3AtY29sb3I9IiM2QjFEMUQiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNCODg2MEIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48L3N2Zz4=";

interface HeroContent {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  heroImage?: string;
  primaryCtaLabel?: string | null;
  primaryCtaHref?: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaHref?: string | null;
  heroCardEyebrow?: string | null;
  heroCardTitle?: string | null;
  heroCardBody?: string | null;
}

interface HeroSectionProps {
  content?: HeroContent;
}

export function HeroSection({ content }: HeroSectionProps) {
  const imageRef = useRef<HTMLDivElement | null>(null);
  const { nudge } = useUiHaptics();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      if (!imageRef.current) return;

      gsap.to(imageRef.current, {
        yPercent: 12,
        ease: "none",
        scrollTrigger: {
          trigger: imageRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, imageRef);

    return () => ctx.revert();
  }, []);

  return (
    <section className="relative min-h-[90vh] overflow-hidden bg-trunk-brown text-white">
      <div ref={imageRef} className="absolute inset-0">
        <Image
          src={content?.heroImage ?? fallbackHeroImage}
          alt="Two women in sarees walking through a sunlit garden"
          fill
          priority
          placeholder="blur"
          blurDataURL={heroBlurDataURL}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-luxury-fade" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-32">
        <ScrollReveal className="max-w-2xl space-y-6">
          <p className="text-xs uppercase tracking-[0.5em] text-amber-100/80">
            {content?.heroEyebrow ?? "From the Trunk"}
          </p>
          <h1 className="font-serif text-4xl leading-tight tracking-wide text-white md:text-6xl">
            {content?.heroTitle ?? "Pre-loved luxury sarees with provenance."}
          </h1>
          <p className="text-lg text-amber-100/80 md:text-xl">
            {content?.heroSubtitle ??
              "Curated heirloom pieces, authenticated and restored with care, each carrying the story that made it timeless."}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15} className="flex flex-wrap gap-4">
          <Button
            asChild
            className="rounded-full px-8 py-6 text-sm transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
          >
            <Link href={content?.primaryCtaHref ?? "/collection"} onClick={nudge}>
              {content?.primaryCtaLabel ?? "Explore the Collection"}
            </Link>
          </Button>
          <Button
            asChild
            variant="heroSecondary"
            className="rounded-full px-8 py-6 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
          >
            <Link href={content?.secondaryCtaHref ?? "/our-story"} onClick={nudge}>
              {content?.secondaryCtaLabel ?? "Read the Story"}
            </Link>
          </Button>
        </ScrollReveal>

        <ScrollReveal delay={0.3} className="max-w-md">
          <div className="rounded-2xl border border-white/25 bg-white/15 p-6 text-sm text-amber-50/80 shadow-soft backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.4em] text-amber-100/60">
              {content?.heroCardEyebrow ?? "New Arrivals"}
            </p>
            <p className="mt-3 font-serif text-xl text-white">
              {content?.heroCardTitle ??
                "Curated designer sarees from the 1980s-2000s."}
            </p>
            <p className="mt-2 text-amber-100/70">
              {content?.heroCardBody ??
                "Limited drops every fortnight. Reserve your piece early."}
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
