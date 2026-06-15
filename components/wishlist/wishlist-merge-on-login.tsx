"use client";

/**
 * P6-04: Session-scoped guest wishlist merge.
 *
 * Mounted once at the Providers level (components/providers.tsx) so the merge
 * runs on ANY page after login — not only on pages that happen to render a
 * WishlistButton. This fixes the consumer-path gap where navigating straight
 * to /account/wishlist after login would show an empty list because no
 * WishlistButton was mounted to trigger the per-button merge effect.
 *
 * Behaviour:
 *   1. When the session transitions to authenticated AND localStorage has been
 *      hydrated, POST /api/v2/wishlist/merge with the guest product IDs.
 *   2. On success, clear the guest store so items are not re-merged.
 *   3. Invalidate ["wishlist"] (prefix) so both the button and page queries
 *      refetch the newly merged state.
 *   4. Failures are non-fatal: logged, guest store retained for retry on next
 *      navigation.
 *
 * The WishlistButton still has its own merge effect as a belt-and-suspenders
 * fallback, but this component is the canonical trigger.
 */

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { useGuestWishlistStore } from "@/lib/store/wishlist-store";

export function WishlistMergeOnLogin() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const guestProductIds = useGuestWishlistStore((s) => s.productIds);
  const guestClear = useGuestWishlistStore((s) => s.clear);
  const hasHydrated = useGuestWishlistStore((s) => s.hasHydrated);

  // Track whether we have already attempted the merge in this browser session
  // to avoid repeated POST calls on every render.
  const mergedRef = useRef(false);

  useEffect(() => {
    if (!session?.user?.id || !hasHydrated || mergedRef.current) return;

    mergedRef.current = true;

    if (guestProductIds.length === 0) {
      guestClear();
      return;
    }

    fetch("/api/v2/wishlist/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: guestProductIds }),
    })
      .then((res) => {
        if (res.ok) {
          guestClear();
          // Invalidate with prefix ["wishlist"] — refreshes both
          // ["wishlist","ids"] (button) and ["wishlist","products"] (page).
          void queryClient.invalidateQueries({ queryKey: ["wishlist"] });
        }
        // If the request fails, leave the guest store intact so items survive
        // until the next successful session (the ref lets us retry on reload).
      })
      .catch(() => {
        // Non-critical — guest store is still intact for retry.
        mergedRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, hasHydrated]);

  return null;
}
