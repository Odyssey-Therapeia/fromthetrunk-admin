import type { Metadata } from "next";

import { CheckoutPageClient } from "@/components/checkout/checkout-page-client";
import { getFeaturedProducts, getProducts } from "@/lib/data/products";
import type { Product } from "@/types/payload-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const featured = await getFeaturedProducts(3);
  const docs = featured.docs.length ? featured.docs : (await getProducts(3)).docs;

  return <CheckoutPageClient featuredPicks={docs as unknown as Product[]} />;
}
