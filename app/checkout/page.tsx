import { CheckoutPageClient } from "@/components/checkout/checkout-page-client";
import { getFeaturedProducts, getProducts } from "@/lib/data/products";

export default async function CheckoutPage() {
  const featured = await getFeaturedProducts(3);
  const featuredPicks = featured.docs.length ? featured.docs : (await getProducts(3)).docs;

  return <CheckoutPageClient featuredPicks={featuredPicks} />;
}
