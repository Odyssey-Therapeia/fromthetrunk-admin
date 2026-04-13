"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StoryNarrativeProps {
  images: string[];
  embedded?: boolean;
}

function SplitWords({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          className="split-word inline-block opacity-0"
          aria-hidden="true"
        >
          {word}&nbsp;
        </span>
      ))}
    </span>
  );
}

const beats = [
  {
    paragraphs: [
      "There\u2019s something quietly powerful about a saree. It carries more than fabric \u2014 it holds memories, milestones, and moments that once meant everything.",
      "In so many homes, these beautiful pieces lie tucked away, preserved but forgotten.",
    ],
    layout: "image-right" as const,
  },
  {
    paragraphs: [
      "From the Trunk was born from a simple, heartfelt belief: these sarees still have stories left to tell.",
    ],
    layout: "text-only-dark" as const,
  },
  {
    paragraphs: [
      "By giving your pre-loved sarees a second life, you\u2019re not just clearing space \u2014 you\u2019re passing on heritage, emotion, and craftsmanship.",
      "Each saree becomes a bridge between past and present, finding new meaning in someone else\u2019s journey.",
    ],
    layout: "image-left" as const,
  },
  {
    paragraphs: [
      "And in doing so, you\u2019re also making a conscious, sustainable choice \u2014 reducing waste while celebrating timeless fashion.",
    ],
    layout: "full-bleed" as const,
  },
];

const climaxLines = [
  {
    text: "At From the Trunk, we don\u2019t just collect sarees.",
    size: "text-xl sm:text-2xl lg:text-3xl",
    muted: true,
  },
  {
    text: "We honor them.",
    size: "text-3xl sm:text-5xl lg:text-7xl",
    muted: false,
  },
  {
    text: "We preserve their stories.",
    size: "text-3xl sm:text-5xl lg:text-7xl",
    muted: false,
  },
  {
    text: "And we help them be loved all over again.",
    size: "text-3xl sm:text-5xl lg:text-8xl",
    muted: false,
  },
];

export function StoryNarrative({ images, embedded = false }: StoryNarrativeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const beatImageIndexes = beats.reduce<{
    indexes: Array<null | number>;
    nextImageIndex: number;
  }>(
    (state, beat) => {
      if (beat.layout === "text-only-dark") {
        return {
          ...state,
          indexes: [...state.indexes, null],
        };
      }

      return {
        indexes: [...state.indexes, state.nextImageIndex],
        nextImageIndex: state.nextImageIndex + 1,
      };
    },
    {
      indexes: [],
      nextImageIndex: embedded ? 0 : 1,
    },
  ).indexes;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      containerRef.current
        ?.querySelectorAll(".split-word, .reveal-el")
        .forEach((el) => {
          (el as HTMLElement).style.opacity = "1";
        });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    let lenis: Lenis | null = null;
    let lenisScrollHandler: null | (() => void) = null;
    let tickerCallback: null | ((time: number) => void) = null;
    const mm = gsap.matchMedia();
    if (!embedded) {
      lenis = new Lenis({ lerp: 0.08, duration: 1.4 });
      lenisScrollHandler = () => ScrollTrigger.update();
      tickerCallback = (time) => lenis?.raf(time * 1000);
      lenis.on("scroll", lenisScrollHandler);
      gsap.ticker.add(tickerCallback);
      gsap.ticker.lagSmoothing(0);
    }

    const ctx = gsap.context(() => {
      if (!containerRef.current) return;

      // ──── HERO (standalone only) ────
      const heroSection = !embedded
        ? containerRef.current.querySelector(".story-hero")
        : null;
      if (heroSection) {
        mm.add("(min-width: 1024px)", () => {
          const heroTl = gsap.timeline({
            scrollTrigger: {
              trigger: heroSection,
              start: "top top",
              end: "+=150%",
              pin: true,
              scrub: 0.8,
            },
          });

          heroTl
            .fromTo(
              heroSection.querySelector(".hero-eyebrow"),
              { autoAlpha: 0, y: 20 },
              { autoAlpha: 1, y: 0, duration: 0.3 }
            )
            .fromTo(
              heroSection.querySelectorAll(".hero-title .split-word"),
              { autoAlpha: 0, y: 30 },
              { autoAlpha: 1, y: 0, stagger: 0.04, duration: 0.3 },
              0.1
            )
            .fromTo(
              heroSection.querySelector(".hero-subtitle"),
              { autoAlpha: 0, y: 20 },
              { autoAlpha: 1, y: 0, duration: 0.3 },
              0.6
            );

          gsap.to(heroSection.querySelector(".hero-parallax"), {
            yPercent: 15,
            ease: "none",
            scrollTrigger: {
              trigger: heroSection,
              start: "top top",
              end: "+=150%",
              scrub: true,
            },
          });
        });

        mm.add("(max-width: 1023px)", () => {
          gsap.fromTo(
            heroSection.querySelectorAll(
              ".hero-eyebrow, .hero-title .split-word, .hero-subtitle"
            ),
            { autoAlpha: 0, y: 20 },
            {
              autoAlpha: 1,
              y: 0,
              stagger: 0.05,
              duration: 0.8,
              ease: "power3.out",
            }
          );
        });
      }

      // ──── NARRATIVE BEATS ────
      containerRef.current
        .querySelectorAll<HTMLElement>(".story-beat")
        .forEach((section) => {
          const layout = section.dataset.layout;
          const imageWrap = section.querySelector(".beat-image-wrap");
          const words = section.querySelectorAll(".split-word");

          mm.add("(min-width: 1024px)", () => {
            const beatTl = gsap.timeline({
              scrollTrigger: {
                trigger: section,
                start: "top top",
                end: "+=200%",
                pin: true,
                scrub: 0.6,
              },
            });

            if (layout === "text-only-dark") {
              beatTl
                .fromTo(
                  section,
                  { backgroundColor: "var(--background)" },
                  { backgroundColor: "#3D2B1F", duration: 0.4 }
                )
                .fromTo(
                  words,
                  { autoAlpha: 0, y: 15 },
                  { autoAlpha: 1, y: 0, stagger: 0.03, duration: 0.6 },
                  0.2
                );
            } else if (layout === "full-bleed") {
              if (imageWrap) {
                beatTl.fromTo(
                  imageWrap,
                  { scale: 1.0 },
                  { scale: 1.06, duration: 1, ease: "none" },
                  0
                );
              }
              beatTl.fromTo(
                words,
                { autoAlpha: 0, y: 15 },
                { autoAlpha: 1, y: 0, stagger: 0.03, duration: 0.5 },
                0.2
              );
            } else {
              if (imageWrap) {
                const clipFrom =
                  layout === "image-left"
                    ? "inset(0 100% 0 0)"
                    : "inset(0 0 0 100%)";
                beatTl.fromTo(
                  imageWrap,
                  { clipPath: clipFrom },
                  {
                    clipPath: "inset(0 0% 0 0%)",
                    duration: 0.5,
                    ease: "power2.inOut",
                  },
                  0
                );
              }
              beatTl.fromTo(
                words,
                { autoAlpha: 0, y: 15 },
                { autoAlpha: 1, y: 0, stagger: 0.03, duration: 0.5 },
                0.3
              );
            }
          });

          mm.add("(max-width: 1023px)", () => {
            if (imageWrap) {
              gsap.fromTo(
                imageWrap,
                { autoAlpha: 0, y: 30 },
                {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.8,
                  ease: "power2.out",
                  scrollTrigger: {
                    trigger: section,
                    start: "top 85%",
                    toggleActions: "play none none reverse",
                  },
                }
              );
            }
            gsap.fromTo(
              words,
              { autoAlpha: 0, y: 15 },
              {
                autoAlpha: 1,
                y: 0,
                stagger: 0.02,
                duration: 0.6,
                ease: "power2.out",
                scrollTrigger: {
                  trigger: section,
                  start: "top 80%",
                  toggleActions: "play none none reverse",
                },
              }
            );
          });
        });

      // ──── CLIMAX ────
      const climaxSection =
        containerRef.current.querySelector(".story-climax");
      if (climaxSection) {
        const climaxItems =
          climaxSection.querySelectorAll<HTMLElement>(".climax-item");

        mm.add("(min-width: 1024px)", () => {
          const climaxTl = gsap.timeline({
            scrollTrigger: {
              trigger: climaxSection,
              start: "top top",
              end: "+=250%",
              pin: true,
              scrub: 0.5,
            },
          });

          climaxItems.forEach((item, i) => {
            const offset = i * 0.2;
            climaxTl
              .fromTo(
                item,
                { autoAlpha: 0, scale: 0.85, y: 30 },
                {
                  autoAlpha: 1,
                  scale: 1,
                  y: 0,
                  duration: 0.2,
                  ease: "power3.out",
                },
                offset
              )
              .to(
                item,
                {
                  autoAlpha: i < climaxItems.length - 1 ? 0 : 1,
                  scale: i < climaxItems.length - 1 ? 1.05 : 1,
                  duration: 0.15,
                },
                offset + 0.15
              );
          });

          climaxTl.fromTo(
            climaxSection.querySelector(".climax-cta"),
            { autoAlpha: 0, y: 20 },
            { autoAlpha: 1, y: 0, duration: 0.15 },
            0.8
          );
        });

        mm.add("(max-width: 1023px)", () => {
          climaxItems.forEach((item, i) => {
            gsap.fromTo(
              item,
              { autoAlpha: 0, y: 20, scale: 0.95 },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.7,
                delay: i * 0.15,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: climaxSection,
                  start: "top 75%",
                  toggleActions: "play none none reverse",
                },
              }
            );
          });
          gsap.fromTo(
            climaxSection.querySelector(".climax-cta"),
            { autoAlpha: 0, y: 20 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.6,
              delay: 0.6,
              scrollTrigger: {
                trigger: climaxSection,
                start: "top 60%",
                toggleActions: "play none none reverse",
              },
            }
          );
        });
      }
    }, containerRef);

    return () => {
      if (tickerCallback) {
        gsap.ticker.remove(tickerCallback);
      }
      if (lenis && lenisScrollHandler) {
        lenis.off("scroll", lenisScrollHandler);
      }
      mm.revert();
      ctx.revert();
      lenis?.destroy();
      lenis = null;
    };
  }, [embedded]);

  const imageForBeat = (beatIndex: number) => {
    const imageIndex = beatImageIndexes[beatIndex];
    if (imageIndex === null) return images[0];
    return images[imageIndex] ?? images[0];
  };

  return (
    <div ref={containerRef} className="overflow-x-hidden">
      {!embedded && (
        <section className="story-hero @container relative flex min-h-screen items-end overflow-hidden">
          <div className="hero-parallax absolute inset-0">
            <Image
              src={images[0]}
              alt="Heirloom saree"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
          </div>
          <div className="relative mx-auto w-full max-w-5xl space-y-5 px-4 pb-20 @[640px]:px-6 @[640px]:pb-28 @[1024px]:pb-36">
            <p className="hero-eyebrow reveal-el text-xs uppercase tracking-[0.5em] text-amber-100/50">
              Our Manifesto
            </p>
            <h1 className="hero-title font-serif text-5xl leading-[1.1] text-white @[640px]:text-6xl @[1024px]:text-8xl">
              <SplitWords text="Why we do what we do" />
            </h1>
            <p className="hero-subtitle reveal-el max-w-lg text-base text-amber-100/60 @[640px]:text-lg @[1024px]:text-xl">
              A story of heritage, second chances, and the quiet power of a saree.
            </p>
          </div>
        </section>
      )}

      {/* ── Narrative Beats ── */}
      {beats.map((beat, i) => {
        if (beat.layout === "text-only-dark") {
          return (
            <section
              key={i}
              data-layout="text-only-dark"
              className="story-beat flex min-h-screen items-center justify-center px-4 sm:px-6"
              style={{ backgroundColor: "var(--background)" }}
            >
              <div className="mx-auto max-w-4xl text-center">
                {beat.paragraphs.map((p, j) => (
                  <p
                    key={j}
                    className="font-serif text-3xl leading-snug text-white sm:text-4xl lg:text-6xl"
                    style={{ marginTop: j > 0 ? "2rem" : 0 }}
                  >
                    <SplitWords text={p} />
                  </p>
                ))}
              </div>
            </section>
          );
        }

        if (beat.layout === "full-bleed") {
          return (
            <section
              key={i}
              data-layout="full-bleed"
              className="story-beat relative flex min-h-screen items-center overflow-hidden"
            >
              <div className="beat-image-wrap absolute inset-0">
                <Image
                  src={imageForBeat(3)}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />
              </div>
              <div className="relative mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
                {beat.paragraphs.map((p, j) => (
                  <p
                    key={j}
                    className="max-w-2xl font-serif text-2xl leading-relaxed text-white/90 sm:text-3xl lg:text-5xl"
                    style={{ marginTop: j > 0 ? "1.5rem" : 0 }}
                  >
                    <SplitWords text={p} />
                  </p>
                ))}
              </div>
            </section>
          );
        }

        const isImageRight = beat.layout === "image-right";
        return (
          <section
            key={i}
            data-layout={beat.layout}
            className="story-beat grid min-h-screen items-center gap-0 lg:grid-cols-[2fr_3fr]"
          >
            <div
              className={cn(
                "flex items-center px-6 py-16 sm:px-10 lg:min-h-screen lg:py-0",
                isImageRight ? "lg:order-1" : "lg:order-2"
              )}
            >
              <div className="mx-auto max-w-lg space-y-6 lg:max-w-none">
                {beat.paragraphs.map((p, j) => (
                  <p
                    key={j}
                    className="font-serif text-xl leading-relaxed text-foreground sm:text-2xl lg:text-3xl"
                  >
                    <SplitWords text={p} />
                  </p>
                ))}
              </div>
            </div>
            <div
              className={cn(
                "relative min-h-[50vh] overflow-hidden lg:min-h-screen",
                isImageRight ? "lg:order-2" : "lg:order-1"
              )}
            >
              <div className="beat-image-wrap absolute inset-0">
                <Image
                  src={imageForBeat(i)}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover"
                />
              </div>
            </div>
          </section>
        );
      })}

      {/* ── Climax ── */}
      <section className="story-climax flex min-h-screen flex-col items-center justify-center px-4 sm:px-6">
        <div className="relative mx-auto flex min-h-[60vh] max-w-4xl flex-col items-center justify-center text-center lg:min-h-[70vh]">
          {climaxLines.map((line, i) => (
            <p
              key={i}
              className={cn(
                "climax-item absolute font-serif leading-tight",
                line.size,
                line.muted ? "text-muted-foreground" : "text-foreground",
                i === 0 && "relative"
              )}
            >
              {line.text}
            </p>
          ))}
        </div>
        <div className="climax-cta reveal-el mt-8 sm:mt-12">
          <Button
            asChild
            className="rounded-full px-10 py-6 text-sm shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <Link href="/collection">Explore the Collection</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
