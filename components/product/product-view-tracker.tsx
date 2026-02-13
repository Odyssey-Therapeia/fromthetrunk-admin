"use client";

import { useEffect } from "react";
import { trackRecentlyViewed } from "@/lib/store/recently-viewed";

interface ProductViewTrackerProps {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
}

/**
 * Invisible component that records a product view in localStorage
 * when mounted. Place it on the product detail page.
 */
export function ProductViewTracker({
  id,
  slug,
  name,
  price,
  image,
}: ProductViewTrackerProps) {
  useEffect(() => {
    trackRecentlyViewed({ id, slug, name, price, image });
  }, [id, slug, name, price, image]);

  return null;
}
