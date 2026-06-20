"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Mic2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WhyChapter = {
  eyebrow: string;
  title: string;
  body: string;
  cue: string;
  imageIndex: number;
};

interface OurWhyExperienceProps {
  images: string[];
}

const fallbackImages = ["/media/home-cover.png", "/media/hero-bg.png"];

const chapters: WhyChapter[] = [
  {
    eyebrow: "Memory",
    title: "Some sarees should not end as storage.",
    body: "A trunk can hold a wedding morning, a festival visit, a mother teaching a daughter how to pleat silk. We start there, with the emotional weight already inside the piece.",
    cue: "Listen for the first life of the saree.",
    imageIndex: 0,
  },
  {
    eyebrow: "Proof",
    title: "The story is beautiful only when the trust is clear.",
    body: "Each piece is inspected, photographed, documented, and priced with context. Provenance is not decoration. It is the reason someone can choose with confidence.",
    cue: "See authentication as part of the romance.",
    imageIndex: 1,
  },
  {
    eyebrow: "Care",
    title: "Restoration should feel quiet, not erased.",
    body: "We clean, repair, and prepare the saree without flattening its past. The goal is not to make it anonymous. The goal is to let it be worn again with dignity.",
    cue: "Notice the work behind the calm.",
    imageIndex: 2,
  },
  {
    eyebrow: "Return",
    title: "A second owner is not an ending. It is continuity.",
    body: "From the Trunk exists so heirlooms can keep moving through real lives. Less waste, more meaning, and a more intimate way to buy luxury.",
    cue: "Imagine the next room this piece enters.",
    imageIndex: 3,
  },
];

const proofPoints = [
  {
    title: "Voice led",
    body: "A guided narration can turn the page into a listening experience.",
    Icon: Mic2,
  },
  {
    title: "Image led",
    body: "Each chapter moves through people, details, and texture.",
    Icon: Sparkles,
  },
  {
    title: "Trust led",
    body: "Authentication and restoration stay visible without becoming heavy.",
    Icon: ShieldCheck,
  },
];

export function OurWhyExperience({ images }: OurWhyExperienceProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const imagePool = useMemo(() => {
    const merged = [...images, ...fallbackImages].filter(Boolean);
    return merged.length ? merged : fallbackImages;
  }, [images]);

  const activeChapter = chapters[activeIndex];
  const activeImage = imagePool[activeChapter.imageIndex % imagePool.length];

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const moveChapter = (direction: -1 | 1) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setActiveIndex((current) => {
      const nextIndex = current + direction;
      if (nextIndex < 0) return chapters.length - 1;
      if (nextIndex >= chapters.length) return 0;
      return nextIndex;
    });
  };

  const selectChapter = (index: number) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setActiveIndex(index);
  };

  const toggleVoice = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `${activeChapter.eyebrow}. ${activeChapter.title}. ${activeChapter.body}`,
    );
    utterance.rate = 0.86;
    utterance.pitch = 0.92;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <main className="overflow-hidden">
      <section className="@container relative isolate min-h-[calc(100svh-8rem)] overflow-hidden bg-foreground text-primary-foreground">
        <div className="absolute inset-0">
          <Image
            src={activeImage}
            alt="From the Trunk saree story"
            fill
            priority
            sizes="100vw"
            className="object-cover transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-linear-to-r from-black/92 via-black/60 to-black/20" />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/20" />
        </div>

        <div className="relative mx-auto grid min-h-[calc(100svh-8rem)] w-full max-w-7xl items-end gap-8 px-4 py-8 @[720px]:px-6 @[960px]:grid-cols-[minmax(0,1fr)_360px] @[960px]:items-center @[960px]:py-12">
          <div className="max-w-3xl pb-3 @[960px]:pb-0">
            <p className="text-xs uppercase tracking-[0.44em] text-primary-foreground/70">
              Our Why
            </p>
            <h1 className="mt-4 max-w-[11ch] text-balance font-serif text-5xl leading-[0.98] text-white drop-shadow-2xl @[640px]:text-7xl @[1120px]:text-8xl">
              A saree can have another life.
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-primary-foreground/82 drop-shadow-lg @[640px]:text-xl">
              We turn private wardrobes into a living archive: authenticated,
              restored, narrated, and ready to be loved again.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="rounded-full px-7 py-6">
                <Link href="/collection">Explore the Collection</Link>
              </Button>
              <Button
                asChild
                variant="heroSecondary"
                className="rounded-full px-7 py-6"
              >
                <Link href="/our-story">Read the Story</Link>
              </Button>
            </div>
          </div>

          <aside className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/20 bg-black/35 p-4 shadow-soft backdrop-blur-md @[640px]:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-primary-foreground/55">
                  Chapter {activeIndex + 1} of {chapters.length}
                </p>
                <h2 className="mt-1 font-serif text-2xl text-white">
                  {activeChapter.eyebrow}
                </h2>
              </div>
              <button
                type="button"
                onClick={toggleVoice}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/14 text-white transition hover:bg-white/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
                aria-label={isSpeaking ? "Pause voiceover" : "Play voiceover"}
              >
                {isSpeaking ? (
                  <CirclePause className="h-5 w-5" />
                ) : (
                  <CirclePlay className="h-5 w-5" />
                )}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <h3 className="font-serif text-3xl leading-tight text-white">
                {activeChapter.title}
              </h3>
              <p className="wrap-break-word text-sm leading-6 text-primary-foreground/78">
                {activeChapter.body}
              </p>
              <p className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-primary-foreground/72">
                {activeChapter.cue}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-2">
              {chapters.map((chapter, index) => (
                <button
                  key={chapter.eyebrow}
                  type="button"
                  onClick={() => selectChapter(index)}
                  className={cn(
                    "h-1.5 rounded-full transition",
                    activeIndex === index ? "bg-accent" : "bg-white/30",
                  )}
                  aria-label={`Open ${chapter.eyebrow}`}
                />
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => moveChapter(-1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
                aria-label="Previous chapter"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="hidden min-w-0 gap-2 overflow-x-auto @[520px]:flex">
                {chapters.map((chapter, index) => (
                  <button
                    key={chapter.eyebrow}
                    type="button"
                    onClick={() => selectChapter(index)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition",
                      activeIndex === index
                        ? "border-accent/70 bg-accent/20 text-white"
                        : "border-white/15 bg-white/8 text-primary-foreground/62 hover:text-white",
                    )}
                  >
                    {chapter.eyebrow}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => moveChapter(1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
                aria-label="Next chapter"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </div>
      </section>

      <section className="@container bg-background px-4 py-12 @[720px]:px-6 @[960px]:py-16">
        <div className="mx-auto grid max-w-7xl gap-4 @[860px]:grid-cols-3">
          {proofPoints.map(({ title, body, Icon }) => (
            <div
              key={title}
              className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-soft"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-serif text-2xl text-foreground">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
