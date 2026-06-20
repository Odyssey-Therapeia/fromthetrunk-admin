import { existsSync } from "fs";
import { join } from "path";
import Image from "next/image";
import Link from "next/link";

type FabricCategory = {
  bestFor: string;
  description: string;
  fallbackImage: string;
  href: string;
  image: string;
  name: string;
};

const fabricCategories: FabricCategory[] = [
  {
    name: "Georgette",
    bestFor: "Best for fluid movement and evening ease",
    description:
      "Choose georgette when you want a graceful fall, soft pleats, and a saree that feels dressed without feeling heavy.",
    href: "/collection?fabric=georgette",
    image: "/category/georgette.jpg",
    fallbackImage: "/hero/timeless.JPG",
  },
  {
    name: "Cotton",
    bestFor: "Best for warm days and everyday elegance",
    description:
      "Cotton is breathable, grounded, and easy to wear for daytime gatherings, workwear, and relaxed heritage styling.",
    href: "/collection?fabric=cotton",
    image: "/category/cotton.JPG",
    fallbackImage: "/media/hero-bg.png",
  },
  {
    name: "Kanjeevaram",
    bestFor: "Best for weddings and ceremonial presence",
    description:
      "Pick Kanjeevaram for structure, rich silk weight, zari detail, and a saree that holds a formal silhouette beautifully.",
    href: "/collection?fabric=kanjeevaram",
    image: "/category/kanjiverram.jpg",
    fallbackImage: "/hero/banner.png",
  },
  {
    name: "Silk",
    bestFor: "Best for timeless polish and soft sheen",
    description:
      "Silk brings luminosity and refinement, making it a dependable choice for festive dinners, family events, and heirloom dressing.",
    href: "/collection?fabric=silk",
    image: "/category/silk.JPG",
    fallbackImage: "/hero/banner1.png",
  },
  {
    name: "Kota Cotton",
    bestFor: "Best for feather-light summer drapes",
    description:
      "Kota cotton feels airy and crisp, with a light grid texture that suits warm weather and understated occasion wear.",
    href: "/collection?fabric=kota-cotton",
    image: "/category/Kota_Cotton.jpg",
    fallbackImage: "/hero/you.png",
  },
  {
    name: "Chiffon",
    bestFor: "Best for soft flow and delicate styling",
    description:
      "Chiffon is sheer, light, and feminine, ideal when you want a saree that moves gently and keeps the look minimal.",
    href: "/collection?fabric=chiffon",
    image: "/category/Chiffon.JPG",
    fallbackImage: "/media/home-cover.png",
  },
  {
    name: "Kanjeevaram Mix",
    bestFor: "Best for festive richness with easier wear",
    description:
      "A Kanjeevaram mix keeps the celebratory mood but can feel lighter and more flexible for long events.",
    href: "/collection?fabric=kanjeevaram-mix",
    image: "/category/kanji_mix.JPG",
    fallbackImage: "/hero/banner.png",
  },
  {
    name: "Organza",
    bestFor: "Best for sculpted volume and modern occasion looks",
    description:
      "Organza has a crisp, sheer body that creates shape and drama while still feeling light on the shoulder.",
    href: "/collection?fabric=organza",
    image: "/category/Organza.JPG",
    fallbackImage: "/hero/timeless.JPG",
  },
  {
    name: "Cotton Silk",
    bestFor: "Best for comfort with a refined finish",
    description:
      "Cotton silk balances breathable ease with a soft sheen, making it versatile for day-to-evening dressing.",
    href: "/collection?fabric=cotton-silk",
    image: "/category/Cotton_Silk.JPG",
    fallbackImage: "/hero/banner1.png",
  },
];

function publicImageExists(src: string) {
  return existsSync(join(process.cwd(), "public", src.replace(/^\//, "")));
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function FabricCategorySection() {
  return (
    <section className="bg-[#F8F4EF] px-5 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-9 grid gap-5 border-b border-[#3C0C0F]/10 pb-8 lg:grid-cols-[0.95fr_0.7fr] lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#7A5430]">
              Shop By Fabric
            </p>
            <h2 className="mt-4 max-w-3xl font-serif text-[clamp(2.45rem,4.6vw,5rem)] leading-[0.95] text-[#3C0C0F]">
              Choose by feel, drape, and occasion.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-[#3C0C0F]/70 lg:justify-self-end">
            Fabric changes how a saree sits, moves, and carries memory. Start
            with the texture that suits your moment.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 md:gap-4">
          {fabricCategories.map((fabric) => {
            const hasImage = publicImageExists(fabric.image);
            const imageSrc = hasImage ? fabric.image : fabric.fallbackImage;

            return (
              <Link
                key={fabric.href}
                href={fabric.href}
                className="group relative flex aspect-3/4 min-h-46 w-[calc((100%-0.75rem)/2)] overflow-hidden rounded-md bg-[#3C0C0F] text-white shadow-[0_16px_44px_rgba(60,12,15,0.13)] transition duration-500 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AA8657] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F4EF] sm:min-h-52 sm:w-[calc((100%-1.5rem)/3)] md:min-h-58 lg:w-[calc((100%-3rem)/4)] xl:min-h-62 2xl:w-[calc((100%-4rem)/5)]"
              >
                <Image
                  src={imageSrc}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 20vw"
                  className="scale-110 object-cover transition duration-700 group-hover:scale-[1.18]"
                />

                <span
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.12)_48%,rgba(60,12,15,0.72)_100%)]"
                  aria-hidden="true"
                />
                <span
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(60,12,15,0.78)_0%,rgba(60,12,15,0.86)_46%,rgba(0,0,0,0.93)_100%)] opacity-0 transition duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden="true"
                />
                <span
                  className="absolute inset-x-0 bottom-0 h-1 bg-[#AA8657]/80 opacity-75 transition duration-500 group-hover:h-1.5 group-hover:opacity-100"
                  aria-hidden="true"
                />

                <span className="relative flex h-full w-full flex-col justify-end p-4 sm:p-5">
                  <span className="block transition duration-500 lg:group-hover:opacity-0 lg:group-focus-visible:opacity-0">
                    <span className="block max-w-[12ch] font-serif text-[clamp(1.65rem,3vw,2.75rem)] leading-[0.9] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.35)]">
                      {fabric.name}
                    </span>
                  </span>

                  <span className="hidden text-xs leading-5 text-white/86 opacity-100 transition duration-500 lg:block lg:absolute lg:inset-x-5 lg:bottom-5 lg:translate-y-4 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:group-focus-visible:translate-y-0 lg:group-focus-visible:opacity-100">
                    <span className="mb-3 hidden font-serif text-[clamp(1.8rem,2.6vw,2.65rem)] leading-none text-white lg:block">
                      {fabric.name}
                    </span>
                    <span className="block text-xs font-semibold text-[#AA8657]">
                      {fabric.bestFor}
                    </span>
                    <span className="mt-2 block">{fabric.description}</span>
                    <span className="mt-4 inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#AA8657]">
                      Explore fabric
                      <ArrowIcon />
                    </span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
