"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAgentStore } from "@/lib/store/agent-store";

const PRODUCT_PAGE_RE =
  /^\/admin\/products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Watches the URL. When on `/admin/products/[id]`, auto-anchors
 * the AI agent panel to that product. Clears when navigating away.
 */
export function useAutoAnchorProduct() {
  const pathname = usePathname();
  const anchoredProductId = useAgentStore((s) => s.anchoredProductId);
  const anchorProduct = useAgentStore((s) => s.anchorProduct);
  const lastPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    const match = pathname.match(PRODUCT_PAGE_RE);

    if (match) {
      const productId = match[1];
      if (productId === anchoredProductId) return;

      // Lightweight single-product fetch (not the 200-product list)
      fetch(`/api/v2/products/by-id/${productId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { name: string } | null) => {
          anchorProduct(productId, data?.name ?? "Product");
        })
        .catch(() => {
          anchorProduct(productId, "Product");
        });
    } else if (anchoredProductId && !pathname.startsWith("/admin/products/")) {
      anchorProduct(null, null);
    }
  }, [pathname, anchoredProductId, anchorProduct]);
}
