/**
 * P5-06: Per-product opengraph-image route.
 *
 * Served at /collection/[slug]/opengraph-image (Next.js App Router convention).
 * Uses real per-product data (name, price, first image) via getProductBySlug.
 * Falls back to the site-level OG image if the product is not found.
 *
 * Per-product OG data extraction is a tested pure function (lib/seo/og-data.ts),
 * tested in tests/unit/aeo-schema-completeness.test.ts.
 *
 * OG image inline styles intentionally use raw hex/px: next/og ImageResponse
 * operates in a Satori/edge environment that does NOT support CSS variables or
 * Tailwind — raw values are required here (same pattern as the existing
 * app/(site)/opengraph-image.tsx).
 */

import { ImageResponse } from "next/og";

import { getProductBySlug } from "@/lib/data/products";
import { extractPdpOgData } from "@/lib/seo/og-data";
import { getSiteOrigin } from "@/lib/config/site";
import type { Product } from "@/types/domain";

export const dynamic = "force-dynamic";
export const alt = "From the Trunk product";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OGImage({ params }: Props) {
  const { slug } = await params;
  const origin = getSiteOrigin();

  const rawProduct = await getProductBySlug(slug);
  const product = rawProduct as Product | null;

  if (!product) {
    // Fallback: site-level branded image
    return new ImageResponse(
      (
        <div
          style={{
            background:
              "linear-gradient(135deg, #3D2B1F 0%, #6B1D1D 50%, #B8860B 100%)",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px",
          }}
        >
          <div
            style={{
              fontSize: "56px",
              fontFamily: "Georgia, serif",
              color: "#F5F0E8",
              textAlign: "center",
            }}
          >
            From the Trunk
          </div>
          <div
            style={{
              fontSize: "24px",
              color: "rgba(245, 240, 232, 0.7)",
              marginTop: "24px",
            }}
          >
            Pre-Loved Luxury Sarees
          </div>
        </div>
      ),
      { ...size }
    );
  }

  const { title, priceRupees, imageUrl } = extractPdpOgData(product);

  // Format price as Indian rupees
  const priceDisplay = `₹${priceRupees.toLocaleString("en-IN")}`;

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #3D2B1F 0%, #6B1D1D 60%, #B8860B 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
        }}
      >
        {/* Product image panel */}
        {imageUrl && (
          <div
            style={{
              width: "50%",
              overflow: "hidden",
              position: "relative",
              display: "flex",
            }}
          >
            <img
              src={imageUrl}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
            {/* gradient overlay so text is readable if product image bleeds */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to right, transparent 60%, #3D2B1F 100%)",
              }}
            />
          </div>
        )}

        {/* Text panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: imageUrl ? "48px 56px 48px 40px" : "60px",
            gap: "20px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              letterSpacing: "0.45em",
              textTransform: "uppercase" as const,
              color: "rgba(245, 240, 232, 0.55)",
            }}
          >
            From the Trunk
          </div>

          <div
            style={{
              fontSize: imageUrl ? "36px" : "52px",
              fontFamily: "Georgia, serif",
              color: "#F5F0E8",
              lineHeight: 1.25,
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: "28px",
              color: "#D4AF37",
              fontFamily: "Georgia, serif",
            }}
          >
            {priceDisplay}
          </div>

          <div
            style={{
              fontSize: "14px",
              color: "rgba(245, 240, 232, 0.5)",
              marginTop: "8px",
            }}
          >
            {origin.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
