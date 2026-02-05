"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Button } from "@/components/ui/button";

const heroImage =
  "https://images.unsplash.com/photo-1641699862936-be9f49b1c38d?q=80&w=2400&auto=format&fit=crop";

export function HeroSection() {
  const imageRef = useRef<HTMLDivElement | null>(null);

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
          src={heroImage}
          alt="Luxurious vintage saree draped in warm light"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-luxury-fade" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-32">
        <ScrollReveal className="max-w-2xl space-y-6">
          <p className="text-xs uppercase tracking-[0.5em] text-amber-100/80">
            A Pre-Loved Collection
          </p>
          <h1 className="font-serif text-4xl leading-tight tracking-wide text-white md:text-6xl">
            From the Trunk
          </h1>
          <p className="text-lg text-amber-100/80 md:text-xl">
            Discover heirloom sarees curated from private collections. Each
            piece is authenticated, preserved, and ready for its next story.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15} className="flex flex-wrap gap-4">
          <Button asChild className="rounded-full px-8 py-6 text-sm transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0">
            <Link href="/collection">Explore the Collection</Link>
          </Button>
          <Button
            asChild
            className="rounded-full bg-white/90 px-8 py-6 text-sm text-trunk-brown shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:bg-white hover:shadow-lift active:translate-y-0"
          >
            <Link href="/our-story">Our Story</Link>
          </Button>
        </ScrollReveal>

        <ScrollReveal delay={0.3} className="max-w-md">
          <div className="rounded-2xl border border-white/25 bg-white/15 p-6 text-sm text-amber-50/80 shadow-soft backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.4em] text-amber-100/60">
              New Arrivals
            </p>
            <p className="mt-3 font-serif text-xl text-white">
              Curated designer sarees from the 1980s–2000s.
            </p>
            <p className="mt-2 text-amber-100/70">
              Limited drops every fortnight. Reserve your piece early.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
