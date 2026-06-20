"use client";
/**
 * components/admin/product-stepper/use-product-type.ts
 *
 * P4-02: React hooks that fetch the list of product types from the API and
 * resolve a single type's attribute_defs for the Attributes step.
 *
 * Design rules:
 *   - No DB calls from client — uses the /api/v2/product-types endpoint.
 *   - Returns the AttributeDef[] array so StepAttributes can pass it to
 *     buildTypeZodSchema() for validation and to SchemaForm for rendering.
 *   - Falls back to [] while loading or when no type is selected.
 *
 * Fetching goes through @tanstack/react-query (same as the rest of the admin),
 * which removes the manual useEffect + setState wiring — and with it the
 * "Calling setState synchronously within an effect" cascade warning. Loading,
 * error handling, request cancellation, and "don't fetch until a type is
 * selected" (via `enabled`) are all handled declaratively, so there is no
 * synchronous state mutation in render or in an effect body.
 *
 * Requires a QueryClientProvider ancestor — already present for the admin tree
 * (the products page and others use react-query under the (admin) layout).
 */
import { useQuery } from "@tanstack/react-query";

import type { AttributeDef } from "@/lib/catalog/type-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ProductTypeSummary = {
  id: string;
  name: string;
  slug: string;
};

type ProductTypeDetail = ProductTypeSummary & {
  attributeDefs: AttributeDef[];
};

// ---------------------------------------------------------------------------
// useProductTypes — list all product types for the type-selection step
// ---------------------------------------------------------------------------
export function useProductTypes(): {
  loading: boolean;
  types: ProductTypeSummary[];
} {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "product-types"],
    // Types change rarely — cache for a few minutes to avoid refetch churn.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductTypeSummary[]> => {
      const response = await fetch("/api/v2/product-types");
      if (!response.ok) {
        // Preserve prior behaviour: a failed load surfaces as an empty list.
        return [];
      }
      const data = (await response.json()) as {
        types?: Array<{ id: string; name: string; slug: string }>;
      };
      return (data.types ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
      }));
    },
  });

  return { loading: isLoading, types: data ?? [] };
}

// ---------------------------------------------------------------------------
// useProductTypeAttributeDefs — resolves defs for a single type
// ---------------------------------------------------------------------------
export function useProductTypeAttributeDefs(typeId: null | string): {
  attributeDefs: AttributeDef[];
  loading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "product-type", typeId],
    // Replaces the old `if (!typeId) { setDetail(null); setLoading(false); }`
    // guard: when nothing is selected the query never runs and `data` stays
    // undefined, so attributeDefs falls back to [].
    enabled: Boolean(typeId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductTypeDetail> => {
      const response = await fetch(`/api/v2/product-types/${typeId}`);
      if (!response.ok) {
        throw new Error(`Failed to load product type ${typeId}`);
      }
      const data = (await response.json()) as {
        id: string;
        name: string;
        slug: string;
        attributeDefs?: AttributeDef[];
      };
      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        attributeDefs: data.attributeDefs ?? [],
      };
    },
  });

  return {
    attributeDefs: data?.attributeDefs ?? [],
    // `isLoading` is false while the query is disabled (no type selected), but
    // we guard on typeId anyway to keep the returned contract identical.
    loading: Boolean(typeId) && isLoading,
  };
}
