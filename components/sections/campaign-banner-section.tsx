"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type CampaignBanner = {
  alt: string;
  image: string;
};

const BANNER_DURATION_MS = 3000;

const campaignBanners: CampaignBanner[] = [
  {
    image: "/banner/banner1.png",
    alt: "Grand Launch Edit, The Trunk Opens campaign banner",
  },
  {
    image: "/banner/banner2.gif",
    alt: "New Arrivals, Newly Yours campaign banner",
  },
  {
    image: "/banner/banner3.png",
    alt: "Provenance Promise, Every Weave Remembers campaign banner",
  },
  {
    image: "/banner/banner4.png",
    alt: "Complimentary Styling, Find the Saree That Finds You campaign banner",
  },
];

export function CampaignBannerSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % campaignBanners.length);
    }, BANNER_DURATION_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="bg-[#F8F4EF] px-5 py-14 sm:px-8 md:py-20 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="relative aspect-2500/1768 w-full overflow-hidden rounded-lg bg-[#120405] shadow-[0_28px_90px_rgba(60,12,15,0.2)]">
          {campaignBanners.map((banner, index) => (
            <div
              key={banner.image}
              className={`absolute inset-0 transition-opacity duration-1100 ease-in-out ${
                activeIndex === index ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={activeIndex !== index}
            >
              <Image
                src={banner.image}
                alt={activeIndex === index ? banner.alt : ""}
                fill
                sizes="(max-width: 768px) calc(100vw - 2.5rem), (max-width: 1280px) calc(100vw - 5rem), 1280px"
                unoptimized={banner.image.endsWith(".gif")}
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
