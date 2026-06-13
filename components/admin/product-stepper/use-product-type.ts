"use client";

/**
 * components/admin/product-stepper/use-product-type.ts
 *
 * P4-02: React hook that fetches the list of product types from the API
 * and resolves a single type's attribute_defs for the Attributes step.
 *
 * Design rules:
 *   - No DB calls from client — uses the /api/v2/product-types endpoint.
 *   - Returns the AttributeDef[] array so StepAttributes can pass it to
 *     buildTypeZodSchema() for validation and to SchemaForm for rendering.
 *   - Falls back to [] while loading or when no type is selected.
 */

import { useEffect, useState } from "react";

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
  const [types, setTypes] = useState<ProductTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/v2/product-types");
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          types?: Array<{ id: string; name: string; slug: string }>;
        };
        if (!cancelled) {
          setTypes(
            (data.types ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
            }))
          );
        }
      } catch {
        // network failure — silently stay empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, types };
}

// ---------------------------------------------------------------------------
// useProductTypeAttributeDefs — resolves defs for a single type
// ---------------------------------------------------------------------------

export function useProductTypeAttributeDefs(typeId: null | string): {
  attributeDefs: AttributeDef[];
  loading: boolean;
} {
  const [detail, setDetail] = useState<ProductTypeDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!typeId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const response = await fetch(`/api/v2/product-types/${typeId}`);
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          id: string;
          name: string;
          slug: string;
          attributeDefs?: AttributeDef[];
        };
        if (!cancelled) {
          setDetail({
            id: data.id,
            name: data.name,
            slug: data.slug,
            attributeDefs: data.attributeDefs ?? [],
          });
        }
      } catch {
        // network failure — fall back to empty
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  return {
    attributeDefs: detail?.attributeDefs ?? [],
    loading,
  };
}
