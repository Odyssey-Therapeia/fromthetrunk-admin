"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type LandingImage = {
  alt: string;
  src: string;
  title?: string;
};

export type LandingProductCard = {
  condition: string;
  detail: string;
  href: string;
  image: string;
  name: string;
  price: string;
};

type SocialCard = {
  caption: string;
  image: string;
  label: string;
};

type LandingSectionsProps = {
  featuredProducts: LandingProductCard[];
  showIntroSeparator?: boolean;
  storyImages: LandingImage[];
};

const FALLBACK_IMAGES = [
  "/hero/timeless.JPG",
  "/hero/you.png",
  "/hero/banner.png",
  "/hero/banner1.png",
  "/media/home-cover.png",
  "/media/hero-bg.png",
] as const;

const fallbackProducts: LandingProductCard[] = [
  {
    name: "Vintage Kanjeevaram",
    detail: "Late 1990s silk weave",
    condition: "Restored border, provenance noted",
    price: "Price on request",
    href: "/collection",
    image: "/hero/timeless.JPG",
  },
  {
    name: "Ivory Organza Drape",
    detail: "Lightweight festive organza",
    condition: "Quality checked, ready to wear",
    price: "Price on request",
    href: "/collection",
    image: "/hero/you.png",
  },
  {
    name: "Maroon Silk Classic",
    detail: "Heritage silk with zari detail",
    condition: "Gently restored, one of one",
    price: "Price on request",
    href: "/collection",
    image: "/hero/banner.png",
  },
  {
    name: "Soft Chiffon Saree",
    detail: "Early 2000s evening drape",
    condition: "Clean finish, archived story",
    price: "Price on request",
    href: "/collection",
    image: "/hero/banner1.png",
  },
  {
    name: "Cotton Silk Heirloom",
    detail: "Breathable cotton-silk blend",
    condition: "Authenticated and refreshed",
    price: "Price on request",
    href: "/collection",
    image: "/media/home-cover.png",
  },
  {
    name: "Kota Cotton Treasure",
    detail: "Featherlight weave",
    condition: "Carefully repaired, next chapter ready",
    price: "Price on request",
    href: "/collection",
    image: "/media/hero-bg.png",
  },
];

const testimonials = [
  {
    name: "Ananya R.",
    text: "The saree felt like it had a soul. The provenance note made the experience personal.",
  },
  {
    name: "Meera S.",
    text: "Restored beautifully without losing its old-world charm.",
  },
  {
    name: "Ritika M.",
    text: "The styling consult helped me pair it with my mother’s jewellery.",
  },
  {
    name: "Devika P.",
    text: "Packaging, fabric, and story all felt thoughtful and refined.",
  },
  {
    name: "Isha K.",
    text: "A rare piece. Everyone asked where it was from.",
  },
];

const story =
  "From family trunks to modern wardrobes, every saree we choose carries a life before this one. We authenticate, restore, and style each piece with care, so its next chapter feels as meaningful as its first.";

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function useTypewriter(text: string, speed = 26) {
  const [visibleText, setVisibleText] = useState("");
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setVisibleText(text), 0);
      return () => window.clearTimeout(timer);
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    if (!started) return;

    let index = 0;

    const interval = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(interval);
      }
    }, speed);

    return () => window.clearInterval(interval);
  }, [started, text, speed]);

  return { ref, visibleText };
}

function fillProducts(products: LandingProductCard[]) {
  const merged = [...products];
  for (const product of fallbackProducts) {
    if (merged.length >= 6) break;
    merged.push(product);
  }
  return merged.slice(0, 6);
}

function fillImages(images: LandingImage[]) {
  const merged = [...images];
  for (const [index, src] of FALLBACK_IMAGES.entries()) {
    if (merged.length >= 5) break;
    merged.push({
      src,
      alt: "Curated saree from From The Trunk",
      title: ["Authenticated", "Restored", "Styled", "Archived", "Re-loved"][
        index
      ],
    });
  }
  return merged.slice(0, 5);
}

function shouldBypassImageOptimizer(src: string) {
  return (
    process.env.NODE_ENV === "development" &&
    (src.startsWith("http://") || src.startsWith("https://"))
  );
}

function buildSocialCards(images: LandingImage[]): SocialCard[] {
  const captions = [
    ["RESTORATION", "Before the drape returns to the wardrobe."],
    ["STYLING", "One saree, many ways to carry presence."],
    ["PROVENANCE", "The detail that makes a piece remembered."],
    ["NEW ARRIVAL", "A quiet statement from the trunk."],
    ["CARE", "Pressed, checked, folded, and ready."],
  ];

  return fillImages(images).map((image, index) => ({
    image: image.src,
    label: captions[index]?.[0] ?? "SOCIAL",
    caption: captions[index]?.[1] ?? "A restored saree finding its next story.",
  }));
}

export function SectionSeparator() {
  return (
    <div className="bg-[#F8F4EF] px-6">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-5 py-3">
        <div className="h-px flex-1 bg-linear-to-r from-transparent via-[#3C0C0F]/20 to-[#3C0C0F]/8" />
        <div className="h-2 w-2 rounded-full bg-[#AA8657]" />
        <div className="h-px flex-1 bg-linear-to-l from-transparent via-[#3C0C0F]/20 to-[#3C0C0F]/8" />
      </div>
    </div>
  );
}

export function OurStorySection({ images }: { images: LandingImage[] }) {
  const storyImages = fillImages(images);
  const { ref, visibleText } = useTypewriter(story);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % storyImages.length);
    }, 3800);

    return () => window.clearInterval(timer);
  }, [storyImages.length]);

  return (
    <section id="our-story" className="bg-[#F8F4EF] px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div ref={ref}>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.34em] text-[#7A5430]">
            Our Story
          </p>
          <h2 className="max-w-xl font-serif text-[clamp(2.7rem,5vw,6rem)] leading-[0.95] text-[#3C0C0F]">
            A next story to every saree.
          </h2>
          <p className="mt-8 min-h-40 max-w-xl text-[clamp(1rem,1.2vw,1.2rem)] leading-8 text-[#3C0C0F]/75">
            {visibleText}
            <span className="ml-1 inline-block translate-y-1 text-[#AA8657]">
              |
            </span>
          </p>
        </div>

        <div className="relative h-130 overflow-hidden rounded-[1.5rem] bg-[#3C0C0F] shadow-2xl shadow-[#3C0C0F]/20 md:h-160">
          {storyImages.map((image, index) => (
            <Image
              key={`${image.src}-${index}`}
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 52vw"
              unoptimized={shouldBypassImageOptimizer(image.src)}
              className={`object-cover transition-opacity duration-1000 ${
                activeImage === index ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-xs uppercase tracking-[0.3em] text-white/65">
              From The Trunk
            </p>
            <h3 className="mt-2 font-serif text-3xl text-white md:text-4xl">
              {storyImages[activeImage]?.title ?? "Curated with care"}
            </h3>
            <div className="mt-6 flex gap-2">
              {storyImages.map((image, index) => (
                <button
                  key={`${image.src}-dot-${index}`}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Show story image ${index + 1}`}
                  className={`h-0.75 rounded-full transition-all ${
                    activeImage === index
                      ? "w-12 bg-[#AA8657]"
                      : "w-7 bg-white/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SocialSection({ images }: { images: LandingImage[] }) {
  const reels = buildSocialCards(images);

  return (
    <section className="bg-[#F8F4EF] px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#7A5430]">
              Social
            </p>
            <h2 className="font-serif text-[clamp(2.8rem,5vw,6rem)] leading-none text-[#3C0C0F]">
              @fromthetrunk
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-[#3C0C0F]/70">
            Reels from our styling table, restoration notes, new arrivals, and
            the women giving old-world sarees a new life.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
          {reels.map((reel) => (
            <article
              key={`${reel.image}-${reel.label}`}
              className="group relative h-[clamp(16rem,70vw,25rem)] overflow-hidden rounded-xl bg-[#3C0C0F] sm:h-102.5 sm:rounded-4xl md:h-112.5"
            >
              <Image
                src={reel.image}
                alt={reel.caption}
                fill
                sizes="(max-width: 1024px) 50vw, 20vw"
                unoptimized={shouldBypassImageOptimizer(reel.image)}
                className="object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/15 to-transparent" />
              <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/45 bg-white/15 text-white backdrop-blur-md transition duration-300 group-hover:scale-110 group-hover:bg-[#AA8657] sm:h-14 sm:w-14">
                <PlayIcon />
              </div>
              <div className="absolute bottom-3 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-6">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#AA8657] sm:text-[11px] sm:tracking-[0.24em]">
                  {reel.label}
                </p>
                <h3 className="mt-1 font-serif text-sm leading-snug text-white sm:mt-2 sm:text-2xl sm:leading-tight">
                  {reel.caption}
                </h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FeaturedProductsSection({
  products,
}: {
  products: LandingProductCard[];
}) {
  const productCards = fillProducts(products);

  return (
    <section className="bg-[#F8F4EF] px-5 py-16 sm:px-6 md:py-22">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#7A5430]">
              Featured Products
            </p>
            <h2 className="font-serif text-[clamp(2.45rem,4.7vw,5.4rem)] leading-none text-[#3C0C0F]">
              New arrivals from the trunk.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-[#3C0C0F]/70">
            Six handpicked sarees selected for craft, condition, provenance, and
            quiet distinction.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-8 min-[520px]:grid-cols-2 min-[520px]:gap-x-5 min-[520px]:gap-y-10 lg:grid-cols-3 2xl:grid-cols-4">
          {productCards.map((product) => (
            <article key={`${product.name}-${product.href}`} className="group">
              <Link href={product.href} className="block">
                <div className="relative aspect-4/5 overflow-hidden rounded-lg bg-[#3C0C0F]/10">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 25vw"
                    unoptimized={shouldBypassImageOptimizer(product.image)}
                    className="object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="absolute left-2 top-2 rounded-full bg-[#F8F4EF]/90 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#3C0C0F] min-[520px]:left-3 min-[520px]:top-3 min-[520px]:px-3 min-[520px]:py-1.5 min-[520px]:text-[10px] min-[520px]:tracking-[0.16em]">
                    One of one
                  </div>
                </div>
                <div className="mt-3 min-[520px]:mt-4">
                  <h3 className="font-serif text-lg leading-tight text-[#3C0C0F] min-[520px]:text-[clamp(1.55rem,2.1vw,2.25rem)]">
                    {product.name}
                  </h3>
                  <p className="mt-1.5 text-xs text-[#3C0C0F]/60 min-[520px]:mt-2 min-[520px]:text-sm">
                    {product.detail}
                  </p>
                  <p className="mt-1 text-xs text-[#7A5430] min-[520px]:text-sm">
                    {product.condition}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#3C0C0F]/10 pt-2.5 min-[520px]:mt-3 min-[520px]:gap-3 min-[520px]:pt-3">
                    <p className="text-sm font-semibold text-[#3C0C0F] min-[520px]:text-base">
                      {product.price}
                    </p>
                    <span className="hidden items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#3C0C0F] transition group-hover:text-[#AA8657] min-[520px]:inline-flex">
                      View Piece
                      <ArrowIcon />
                    </span>
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TestimonialsSection() {
  const duplicated = [...testimonials, ...testimonials];

  return (
    <section
      id="testimonials"
      className="overflow-hidden bg-[#3C0C0F] py-20 md:py-28"
    >
      <div className="mx-auto mb-12 max-w-7xl px-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#AA8657]">
          Testimonials
        </p>
        <h2 className="max-w-3xl font-serif text-[clamp(2.8rem,5vw,6rem)] leading-none text-white">
          Worn again, remembered forever.
        </h2>
      </div>

      <div className="ftt-marquee flex w-max gap-5 px-6">
        {duplicated.map((review, index) => (
          <article
            key={`${review.name}-${index}`}
            className="w-82.5 shrink-0 rounded-4xlrounded-4xl border border-white/10 bg-white/6 p-7 text-white backdrop-blur-md md:w-107.5"
          >
            <p className="font-serif text-2xl leading-tight text-white/92 md:text-3xl">
              &ldquo;{review.text}&rdquo;
            </p>
            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#AA8657]">
                {review.name}
              </p>
              <p className="text-sm text-white/50">Verified note</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ConnectWithUsSection() {
  return (
    <section
      id="connect"
      className="bg-[#F8F4EF] px-4 py-16 sm:px-6 sm:py-20 md:py-28"
    >
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[1.5rem] bg-[#3C0C0F] p-5 text-white sm:gap-12 sm:p-6 md:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:p-16">
        <div className="min-w-0">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.34em] text-[#AA8657] sm:mb-5">
            Connect With Us
          </p>
          <h2 className="font-serif text-[clamp(2.25rem,8vw,3rem)] leading-[1.05] sm:text-[clamp(2.8rem,5vw,6rem)] sm:leading-none">
            Looking for a saree with a story?
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/72 sm:mt-7 sm:text-lg sm:leading-8">
            Tell us what you are dressing for. We will help you discover a
            restored piece that feels personal, considered, and entirely yours.
          </p>

          <div className="mt-7 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4">
            {[
              ["Styling", "Book a consult", "/styling-consult"],
              [
                "Instagram",
                "@from.thetrunk",
                "https://www.instagram.com/from.thetrunk/",
              ],
              ["WhatsApp", "Chat with us", "https://wa.me/919731910202"],
              [
                "Email",
                "hello@fromthetrunk.shop",
                "mailto:hello@fromthetrunk.shop",
              ],
            ].map(([label, title, href]) => (
              <a
                key={label}
                href={href}
                className="min-w-0 rounded-2xl border border-white/12 bg-white/6 p-4 transition hover:border-[#AA8657] hover:bg-white/10 sm:p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#AA8657]">
                  {label}
                </p>
                <p className="mt-1.5 wrap-break-word font-serif text-xl sm:mt-2 sm:text-2xl">
                  {title}
                </p>
              </a>
            ))}
          </div>
        </div>

        <form className="min-w-0 rounded-4xl bg-[#F8F4EF] p-5 text-[#3C0C0F] sm:p-6 md:p-8">
          <div className="grid gap-4 sm:gap-5">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3C0C0F]/60">
                Name
              </span>
              <input
                className="w-full rounded-full border border-[#3C0C0F]/15 bg-white px-4 py-3.5 outline-none transition focus:border-[#AA8657] sm:px-5 sm:py-4"
                placeholder="Your name"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3C0C0F]/60">
                Email
              </span>
              <input
                type="email"
                className="w-full rounded-full border border-[#3C0C0F]/15 bg-white px-4 py-3.5 outline-none transition focus:border-[#AA8657] sm:px-5 sm:py-4"
                placeholder="you@example.com"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3C0C0F]/60">
                Message
              </span>
              <textarea
                rows={5}
                className="w-full resize-none rounded-3xl border border-[#3C0C0F]/15 bg-white px-4 py-3.5 outline-none transition focus:border-[#AA8657] sm:px-5 sm:py-4"
                placeholder="Tell us what you are looking for..."
              />
            </label>
            <button
              type="button"
              className="mt-2 rounded-full bg-[#3C0C0F] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-[#AA8657] transition hover:bg-[#280609] sm:py-4"
            >
              Send Message
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function LandingSections({
  featuredProducts,
  showIntroSeparator = true,
  storyImages,
}: LandingSectionsProps) {
  return (
    <>
      {showIntroSeparator ? <SectionSeparator /> : null}
      <OurStorySection images={storyImages} />
      <SectionSeparator />
      <SocialSection images={storyImages} />
      <SectionSeparator />
      <FeaturedProductsSection products={featuredProducts} />
      <SectionSeparator />
      <TestimonialsSection />
      <SectionSeparator />
      <ConnectWithUsSection />
    </>
  );
}
