import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf-8");
}

describe("Instagram link fix", () => {
  const footer = readSource("components/layout/site-footer.tsx");

  it("points to the correct Instagram handle (from.thetrunk)", () => {
    expect(footer).toContain("https://www.instagram.com/from.thetrunk/");
  });

  it("does not contain the old wrong handle", () => {
    expect(footer).not.toContain("instagram.com/fromthetrunk");
  });
});

describe("WhatsApp link fix", () => {
  const footer = readSource("components/layout/site-footer.tsx");

  it("uses the real phone number 919731910202", () => {
    expect(footer).toContain("https://wa.me/919731910202");
  });

  it("does not contain the placeholder number", () => {
    expect(footer).not.toContain("910000000000");
  });
});

describe("Light mode only", () => {
  const header = readSource("components/layout/site-header.tsx");
  const globalsCss = readSource("app/globals.css");

  it("header does not import ThemeToggle", () => {
    expect(header).not.toContain("ThemeToggle");
    expect(header).not.toContain("theme-toggle");
  });

  it("theme-toggle.tsx file is deleted", () => {
    expect(() =>
      readSource("components/layout/theme-toggle.tsx")
    ).toThrow();
  });

  it("globals.css has no .dark block", () => {
    expect(globalsCss).not.toMatch(/\.dark\s*\{/);
  });

  it("globals.css has no dark custom-variant", () => {
    expect(globalsCss).not.toContain("@custom-variant dark");
  });
});

describe("Brand content — Our Story page", () => {
  const ourStory = readSource("app/(site)/our-story/page.tsx");

  it("uses 'Born in Bengaluru' hero title", () => {
    expect(ourStory).toContain("Born in Bengaluru, rooted in heritage");
  });

  it("contains the real trunk journey narrative", () => {
    expect(ourStory).toContain(
      "Why let beautiful sarees fade away in dark trunks?"
    );
  });

  it("has the Sourcing card", () => {
    expect(ourStory).toContain('"Sourcing"');
  });

  it("has the Quality Control card", () => {
    expect(ourStory).toContain('"Quality Control"');
  });

  it("has the Eco-Restoration card", () => {
    expect(ourStory).toContain('"Eco-Restoration"');
  });

  it("no longer has the old generic card titles", () => {
    expect(ourStory).not.toContain("Curated Heritage");
    expect(ourStory).not.toContain("Authenticated Craft");
    expect(ourStory).not.toContain("Modern Heirlooms");
  });
});

describe("Brand content — BrandStoryTeaser", () => {
  const teaser = readSource("components/sections/brand-story-teaser.tsx");

  it("uses the Bengaluru heading", () => {
    expect(teaser).toContain("Born in Bengaluru, rooted in heritage");
  });

  it("no longer has the old heading", () => {
    expect(teaser).not.toContain("The trunk that carries memories");
  });
});

describe("Brand content — How It Works page", () => {
  const hiw = readSource("app/(site)/how-it-works/page.tsx");

  it("has Sourcing step", () => {
    expect(hiw).toContain('"Sourcing"');
  });

  it("has Quality Control step", () => {
    expect(hiw).toContain('"Quality Control"');
  });

  it("has Eco-Restoration step", () => {
    expect(hiw).toContain('"Eco-Restoration"');
  });

  it("has Sustainable Packaging step", () => {
    expect(hiw).toContain('"Sustainable Packaging"');
  });

  it("has Doorstep Magic step", () => {
    expect(hiw).toContain("Doorstep Magic");
  });

  it("uses the 'second story' heading", () => {
    expect(hiw).toContain("Give your saree a second story");
  });

  it("no longer has the old generic step titles", () => {
    expect(hiw).not.toContain("Sourcing & Curation");
    expect(hiw).not.toContain("Authentication");
    expect(hiw).not.toContain('"Restoration"');
  });
});

describe("Product gallery UX fix", () => {
  const gallery = readSource("components/product/product-gallery.tsx");
  const productPage = readSource("app/(site)/collection/[slug]/page.tsx");

  it("constrains image height on mobile with max-h-[44vh]", () => {
    expect(gallery).toContain("max-h-[44vh]");
  });

  it("uses a slightly larger height cap on small tablets", () => {
    expect(gallery).toContain("sm:max-h-[50vh]");
  });

  it("removes height cap on desktop with lg:max-h-none", () => {
    expect(gallery).toContain("lg:max-h-none");
  });

  it("gallery container is sticky only on lg", () => {
    expect(gallery).toContain("lg:sticky lg:top-28");
  });

  it("thumbnails can scroll horizontally on small screens", () => {
    expect(gallery).toContain("overflow-x-auto");
  });

  it("moves product details above the gallery on mobile", () => {
    expect(productPage).toContain('className="order-2 lg:order-1"');
    expect(productPage).toContain(
      'className="order-1 flex flex-col gap-6 lg:order-2"'
    );
  });

  it("moves the purchase block ahead of narrative copy on mobile", () => {
    expect(productPage).toContain(
      'className="order-2 space-y-4 border-t border-border/60 pt-6 lg:order-3"'
    );
    expect(productPage).toContain(
      'className="order-3 space-y-4 border-t border-border/60 pt-6 lg:order-2"'
    );
  });
});

describe("Public storefront QA regressions", () => {
  const collectionPage = readSource("app/(site)/collection/page.tsx");
  const productPage = readSource("app/(site)/collection/[slug]/page.tsx");
  const siteHeader = readSource("components/layout/site-header.tsx");

  it("collection filter chips are sourced only from collections with products", () => {
    expect(collectionPage).toContain("onlyWithProducts: true");
  });

  it("missing product pages explicitly return notFound", () => {
    expect(productPage).toContain("return notFound();");
  });

  it("mobile menu sheet has a visually hidden title", () => {
    expect(siteHeader).toContain("SheetTitle");
    expect(siteHeader).toContain("sr-only");
    expect(siteHeader).toContain("Mobile navigation");
  });
});
