import type { Product } from "@/types/payload-types";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";

const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "https://fromthetrunk.com";

/**
 * Generate JSON-LD structured data for a product page.
 * See: https://schema.org/Product
 */
export function productJsonLd(product: Product): Record<string, unknown> {
  const image = resolveMediaURL(product.images?.[0]);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.story?.narrative ??
      `${product.name} — ${product.details?.fabric ?? "Heirloom"} saree.`,
    ...(image ? { image } : {}),
    brand: {
      "@type": "Brand",
      name: "From the Trunk",
    },
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "INR",
      availability:
        product.stockStatus === "sold"
          ? "https://schema.org/SoldOut"
          : product.stockStatus === "reserved"
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock",
      url: `${baseUrl}/collection/${product.slug}`,
      seller: {
        "@type": "Organization",
        name: "From the Trunk",
      },
    },
    ...(product.details?.condition
      ? { itemCondition: "https://schema.org/UsedCondition" }
      : {}),
    ...(product.details?.fabric
      ? { material: product.details.fabric }
      : {}),
  };
}

/**
 * Generate JSON-LD for the organization.
 */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "From the Trunk",
    url: baseUrl,
    description:
      "Curated collection of authenticated, pre-loved luxury sarees with provenance.",
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@fromthetrunk.com",
      contactType: "customer service",
    },
  };
}

/**
 * Generate breadcrumb JSON-LD.
 */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
