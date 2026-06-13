"use client";

import { useQuery } from "@tanstack/react-query";

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  pricePaise: number;
  originalPricePaise: number | null;
  createdAt?: string;
  detailsFabric: string | null;
  detailsDesigner: string | null;
  status: "draft" | "published";
  stockStatus: "available" | "reserved" | "sold";
  storyTitle: string;
  featured: boolean;
  thumbnailUrl: string | null;
  imageCount: number;
  coverImageFilename: string | null;
  collection: { id: string; name: string } | null;
};

type UseProductsOptions = {
  search?: string;
  status?: string;
  stockStatus?: string;
};

// Admin catalogs are expected to be small enough to fit in one page; we raise
// the client-side cap and forward filter params so the API can honour them
// once server-side filtering lands. Filters are still applied locally as a
// fallback to ensure results stay correct for any unsupported param.
const ADMIN_PRODUCT_PAGE_CAP = 1000;

export function useProducts(options: UseProductsOptions = {}) {
  return useQuery({
    queryKey: ["admin", "products", options],
    queryFn: async (): Promise<ProductListItem[]> => {
      const params = new URLSearchParams();
      params.set("includeDrafts", "true");
      params.set("limit", String(ADMIN_PRODUCT_PAGE_CAP));
      if (options.search) params.set("search", options.search);
      if (options.status && options.status !== "all") {
        params.set("status", options.status);
      }
      if (options.stockStatus && options.stockStatus !== "all") {
        params.set("stockStatus", options.stockStatus);
      }

      const res = await fetch(`/api/v2/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load products");
      const data: ProductListItem[] = await res.json();

      let filtered = data;

      if (options.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.storyTitle.toLowerCase().includes(q) ||
            p.slug.toLowerCase().includes(q),
        );
      }
      if (options.status && options.status !== "all") {
        filtered = filtered.filter((p) => p.status === options.status);
      }
      if (options.stockStatus && options.stockStatus !== "all") {
        filtered = filtered.filter((p) => p.stockStatus === options.stockStatus);
      }

      return filtered;
    },
  });
}
