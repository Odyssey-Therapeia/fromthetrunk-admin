import type { Product } from "@/types/domain";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getProductDisplayDetails } from "@/lib/products/display-details";
import { getSiteOrigin } from "@/lib/config/site";

/**
 * Generate JSON-LD structured data for a product page.
 * See: https://schema.org/Product
 */
export function productJsonLd(product: Product): Record<string, unknown> {
  const image = resolveMediaURL(product.images?.[0]);
  const displayDetails = getProductDisplayDetails(product);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.storyNarrative ??
      `${product.name}: ${displayDetails.fabric}.`,
    ...(image ? { image } : {}),
    brand: {
      "@type": "Brand",
      name: "From the Trunk",
    },
    offers: {
      "@type": "Offer",
      price: product.pricePaise / 100,
      priceCurrency: "INR",
      availability:
        product.stockStatus === "sold"
          ? "https://schema.org/SoldOut"
          : product.stockStatus === "reserved"
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock",
      url: `${getSiteOrigin()}/collection/${product.slug}`,
      seller: {
        "@type": "Organization",
        name: "From the Trunk",
      },
    },
    ...(product.detailsCondition
      ? { itemCondition: "https://schema.org/UsedCondition" }
      : {}),
    material: displayDetails.fabric,
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
    url: getSiteOrigin(),
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
 * Serialize JSON-LD data for safe inline embedding in a <script> tag.
 *
 * JSON.stringify does not escape `<`, so a value containing `</script>`
 * would cause the HTML parser to close the script block early (XSS vector).
 * Unicode-escaping `<` fixes this while remaining valid JSON — parsers decode
 * `<` back to `<` transparently.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
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
