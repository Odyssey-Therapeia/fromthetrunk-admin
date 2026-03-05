import type { SiteConfigContent } from "@/db/queries/globals";

export type CollectionPageContent = SiteConfigContent & {
  description?: null | string;
  eyebrow?: null | string;
  filtersBody?: null | string;
  filtersTitle?: null | string;
  title?: null | string;
};

export type HomePageContent = SiteConfigContent & {
  featuredBody?: null | string;
  featuredCtaHref?: null | string;
  featuredCtaLabel?: null | string;
  featuredEyebrow?: null | string;
  featuredTitle?: null | string;
  heroCardBody?: null | string;
  heroCardEyebrow?: null | string;
  heroCardTitle?: null | string;
  heroEyebrow?: null | string;
  heroImage?: null | string;
  heroSubtitle?: null | string;
  heroTitle?: null | string;
  primaryCtaHref?: null | string;
  primaryCtaLabel?: null | string;
  secondaryCtaHref?: null | string;
  secondaryCtaLabel?: null | string;
};
