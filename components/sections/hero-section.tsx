"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";
import { useHomeIntroReady } from "@/components/sections/home-intro-gate";

const SLIDE_DURATION_MS = 8500;
const SLIDE_TRANSITION_MS = 1600;
const HERO_GOLD = "#C18D39";

type HeadlinePart = {
  text: string;
  accent?: boolean;
};

type Slide = {
  image: string;
  mobileImage: string;
  imagePosition?: string;
  tabletImagePosition?: string;
  mobileImagePosition?: string;
  hideMobileDescription?: boolean;
  eyebrow: string;
  description: string;
  headline: HeadlinePart[];
  mobileHeadline?: HeadlinePart[][];
  headlineClassName?: string;
  mobileCopyClassName?: string;
  mobileHeadlineClassName?: string;
};

const slides: Slide[] = [
  {
    image: "/hero/3.png",
    mobileImage: "/hero/mobile_1.png",
    imagePosition: "center center",
    tabletImagePosition: "58% center",
    mobileImagePosition: "center 80%",
    eyebrow: "From the Trunk",
    headline: [
      { text: "Crafted for the " },
      { text: "FEARLESS", accent: true },
      { text: "." },
    ],
    mobileHeadline: [
      [{ text: "Crafted for the" }],
      [{ text: "FEARLESS", accent: true }, { text: "." }],
    ],
    description: "Handcrafted pieces for women who lead with confidence.",
    mobileCopyClassName:
      "justify-end pb-[clamp(7.5rem,16vh,10rem)] md:justify-start md:pb-0",
  },
  {
    image: "/hero/4.png",
    mobileImage: "/hero/mobile_2.png",
    imagePosition: "center center",
    tabletImagePosition: "58% center",
    mobileImagePosition: "center top",
    eyebrow: "HERITAGE IN MOTION",
    headline: [{ text: "TIMELESS", accent: true }, { text: " by design." }],
    mobileHeadline: [
      [{ text: "TIMELESS", accent: true }],
      [{ text: "by design." }],
    ],
    description:
      "Created to be cherished today, tomorrow, and for generations.",
    mobileCopyClassName: "justify-start pt-[clamp(3rem,7vh,5rem)] md:pt-16",
  },
  {
    image: "/hero/5.png",
    mobileImage: "/hero/mobile_3.png",
    imagePosition: "center center",
    tabletImagePosition: "56% center",
    mobileImagePosition: "center top",
    eyebrow: "The Final statement",
    headline: [
      { text: "Beautiful " },
      { text: "YOU", accent: true },
      { text: "." },
    ],
    mobileHeadline: [
      [{ text: "Beautiful" }],
      [{ text: "YOU", accent: true }, { text: "." }],
    ],
    description: "Every weave becomes a story when you wear it.",
    mobileCopyClassName: "justify-start pt-[clamp(3rem,7vh,5rem)] md:pt-16",
  },
  {
    image: "/hero/6.png",
    mobileImage: "/hero/mobile_4.png",
    imagePosition: "center center",
    tabletImagePosition: "58% center",
    mobileImagePosition: "center top",
    eyebrow: "Curated Drop",
    headline: [
      { text: "FROM THE " },
      { text: "TRUNK", accent: true },
      { text: ", TO YOUR " },
      { text: "WARDROBE", accent: true },
      { text: "." },
    ],
    mobileHeadline: [
      [{ text: "FROM THE" }],
      [{ text: "TRUNK", accent: true }, { text: ", TO" }],
      [{ text: "YOUR" }],
      [{ text: "WARDROBE", accent: true }, { text: "." }],
    ],
    description:
      "Treasured sarees, thoughtfully restored for the Fearless, Timeless You, ready to continue their legacy through a new story.",
    hideMobileDescription: true,
    headlineClassName:
      "md:!text-[clamp(2.45rem,4.7vw,4.35rem)] lg:!text-[clamp(3.2rem,5.15vw,6.35rem)]",
    mobileCopyClassName:
      "justify-start pt-[clamp(2.75rem,6vh,4.25rem)] md:pt-16",
    mobileHeadlineClassName: "!text-[clamp(2.65rem,11vw,4rem)] !leading-[0.92]",
  },
];

interface HeroSectionProps {
  content?: unknown;
}

function renderHeadline(parts: HeadlinePart[]) {
  return (
    <>
      {parts.map((part, index) =>
        part.accent ? (
          <span
            key={`${part.text}-${index}`}
            className="inline-block text-[1.18em] font-semibold md:font-bold"
            style={{ color: HERO_GOLD }}
          >
            {part.text}
          </span>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function renderMobileHeadline(slide: Slide) {
  if (!slide.mobileHeadline) {
    return renderHeadline(slide.headline);
  }

  return (
    <>
      {slide.mobileHeadline.map((line, index) => (
        <span key={index} className="block whitespace-nowrap">
          {renderHeadline(line)}
        </span>
      ))}
    </>
  );
}

function HeroCopy({
  mode,
  slide,
}: {
  mode: "mobile" | "desktop";
  slide: Slide;
}) {
  const isMobile = mode === "mobile";

  return (
    <div
      className={
        isMobile
          ? "w-full max-w-[min(88vw,28rem)] drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)]"
          : "drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)] transition-transform duration-500 md:w-[clamp(20rem,38vw,32rem)] md:max-w-none lg:w-[clamp(24rem,40vw,44rem)]"
      }
    >
      <p
        className={
          isMobile
            ? "font-sans text-[clamp(0.72rem,2.8vw,0.9rem)] font-semibold uppercase tracking-[0.32em] text-white/82"
            : "font-serif text-[clamp(0.68rem,0.75vw,0.95rem)] font-semibold uppercase tracking-[0.44em] text-white/88 lg:tracking-[0.5em]"
        }
      >
        {slide.eyebrow}
      </p>
      <span
        className={
          isMobile
            ? "mb-4 mt-3 block h-px w-[clamp(5.5rem,24vw,8rem)] bg-linear-to-r from-[#C18D39] via-[#C18D39]/70 to-transparent"
            : "mb-6 mt-4 block h-px w-32 bg-linear-to-r from-[#C18D39] via-[#C18D39]/70 to-transparent"
        }
        aria-hidden="true"
      />
      <h1
        className={[
          isMobile
            ? "max-w-full font-serif text-[clamp(3.15rem,13vw,5rem)] font-medium leading-[0.9] text-white"
            : "max-w-none font-serif text-[clamp(2.8rem,6vw,4.8rem)] font-semibold leading-[0.96] text-white lg:text-[clamp(4rem,6vw,7.6rem)]",
          isMobile
            ? (slide.mobileHeadlineClassName ?? "")
            : (slide.headlineClassName ?? ""),
        ].join(" ")}
      >
        {isMobile
          ? renderMobileHeadline(slide)
          : renderHeadline(slide.headline)}
      </h1>
      {!(isMobile && slide.hideMobileDescription) ? (
        <p
          className={
            isMobile
              ? "mt-5 w-full max-w-[min(84vw,24rem)] font-sans text-[clamp(1rem,3.75vw,1.22rem)] leading-[1.55] text-white/86"
              : "mt-6 w-auto max-w-[clamp(18rem,34vw,30rem)] text-[clamp(0.95rem,1vw,1.25rem)] leading-[1.65] text-white/84 lg:max-w-[clamp(22rem,36vw,36rem)]"
          }
        >
          {slide.description}
        </p>
      ) : null}
    </div>
  );
}

export function HeroSection(props: HeroSectionProps) {
  void props;

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const lockedRef = useRef(false);
  const unlockTimeoutRef = useRef<number | null>(null);
  const { nudge } = useUiHaptics();
  const isIntroReady = useHomeIntroReady();

  const changeSlide = useCallback(
    (nextIndex: number) => {
      const safeNextIndex = (nextIndex + slides.length) % slides.length;

      if (safeNextIndex === activeImageIndex || lockedRef.current) {
        return;
      }

      lockedRef.current = true;
      setActiveImageIndex(safeNextIndex);

      unlockTimeoutRef.current = window.setTimeout(() => {
        lockedRef.current = false;
      }, SLIDE_TRANSITION_MS);
    },
    [activeImageIndex],
  );

  const nextSlide = useCallback(() => {
    changeSlide(activeImageIndex + 1);
  }, [activeImageIndex, changeSlide]);

  const previousSlide = useCallback(() => {
    changeSlide(activeImageIndex - 1);
  }, [activeImageIndex, changeSlide]);

  useEffect(() => {
    if (!isIntroReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      nextSlide();
    }, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [activeImageIndex, isIntroReady, nextSlide]);

  useEffect(() => {
    if (isIntroReady) {
      return;
    }

    lockedRef.current = false;

    if (unlockTimeoutRef.current) {
      window.clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = null;
    }
  }, [isIntroReady]);

  useEffect(() => {
    return () => {
      if (unlockTimeoutRef.current) {
        window.clearTimeout(unlockTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section
      id="home-hero"
      className="relative h-[calc(100svh-9.125rem)] min-h-136 overflow-hidden text-white md:h-[min(calc(100svh-6.625rem),60vw)] md:min-h-144 lg:h-[min(calc(100svh-6.625rem),56.25vw)] lg:min-h-152 xl:min-h-160 2xl:min-h-168h-[clamp(2rem,1.6rem+1.7vw,3.25rem)]"
    >
      <div className="absolute inset-0">
        {slides.map((slide, index) => (
          <div
            key={`${slide.image}-tablet`}
            aria-hidden={activeImageIndex !== index}
            className={[
              "absolute inset-0 hidden bg-cover opacity-0 transition-opacity ease-in-out md:block lg:hidden",
              activeImageIndex === index ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{
              backgroundImage: `url("${slide.image}")`,
              backgroundPosition:
                slide.tabletImagePosition ??
                slide.imagePosition ??
                "center center",
              transitionDuration: `${SLIDE_TRANSITION_MS}ms`,
            }}
          />
        ))}
        {slides.map((slide, index) => (
          <div
            key={slide.image}
            aria-hidden={activeImageIndex !== index}
            className={[
              "absolute inset-0 hidden bg-cover opacity-0 transition-opacity ease-in-out lg:block",
              activeImageIndex === index ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{
              backgroundImage: `url("${slide.image}")`,
              backgroundPosition: slide.imagePosition ?? "center center",
              transitionDuration: `${SLIDE_TRANSITION_MS}ms`,
            }}
          />
        ))}
        {slides.map((slide, index) => (
          <div
            key={`${slide.image}-mobile`}
            aria-hidden={activeImageIndex !== index}
            className={[
              "absolute inset-0 bg-cover bg-center opacity-0 transition-opacity ease-in-out md:hidden",
              activeImageIndex === index ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{
              backgroundImage: `url("${slide.mobileImage}")`,
              backgroundPosition: slide.mobileImagePosition ?? "center center",
              transitionDuration: `${SLIDE_TRANSITION_MS}ms`,
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          nudge();
          previousSlide();
        }}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 z-30 flex h-[clamp(2rem,1.6rem+1.7vw,3.25rem)] w-[clamp(2rem,1.6rem+1.7vw,3.25rem)] -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md transition duration-300 hover:border-[#aa8657] hover:bg-[#3c0c0f]/80 hover:text-[#aa8657] md:left-8 md:top-auto md:bottom-10 md:translate-y-0"
      >
        <ChevronLeft
          className="h-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)] w-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)]"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        onClick={() => {
          nudge();
          nextSlide();
        }}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 z-30 flex h-[clamp(2rem,1.6rem+1.7vw,3.25rem)] w-[clamp(2rem,1.6rem+1.7vw,3.25rem)] -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md transition duration-300 hover:border-[#aa8657] hover:bg-[#3c0c0f]/80 hover:text-[#aa8657] md:right-8 md:top-auto md:bottom-10 md:translate-y-0"
      >
        <ChevronRight
          className="h-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)] w-[clamp(1.05rem,0.85rem+0.85vw,1.5rem)]"
          aria-hidden="true"
        />
      </button>

      <div className="relative z-20 h-full w-full">
        {slides.map((slide, index) => (
          <div
            key={`${slide.image}-content`}
            aria-hidden={activeImageIndex !== index}
            className={[
              "absolute inset-0 transition-opacity ease-in-out",
              activeImageIndex === index ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{ transitionDuration: `${SLIDE_TRANSITION_MS}ms` }}
          >
            <div
              className={[
                "flex h-full flex-col px-[clamp(2rem,7.5vw,3.25rem)] md:hidden",
                slide.mobileCopyClassName ?? "justify-start pt-32",
              ].join(" ")}
              aria-live="polite"
            >
              <HeroCopy mode="mobile" slide={slide} />
            </div>

            <div
              className={[
                "hidden h-full md:flex md:flex-row md:items-center md:px-0 md:py-0 md:pl-[clamp(2rem,6vw,5rem)] md:pr-[clamp(1.5rem,4vw,3rem)] lg:pl-[clamp(5rem,8vw,13rem)] lg:pr-[clamp(3rem,5vw,6rem)]",
                slide.mobileCopyClassName ?? "md:justify-start",
              ].join(" ")}
              aria-live="polite"
            >
              <HeroCopy mode="desktop" slide={slide} />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 gap-3 md:bottom-10">
        {slides.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              nudge();
              changeSlide(index);
            }}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={activeImageIndex === index ? "true" : undefined}
            className={[
              "h-0.75 rounded-full transition-all duration-500",
              activeImageIndex === index
                ? "w-12 bg-[#C18D39]"
                : "w-7 bg-white/35 hover:bg-white/60",
            ].join(" ")}
          />
        ))}
      </div>
    </section>
  );
}
