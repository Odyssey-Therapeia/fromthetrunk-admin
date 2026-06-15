/**
 * P6-04: Guest wishlist store — localStorage-backed via Zustand persist.
 *
 * Used when the user is NOT logged in. On login, the guest list is merged
 * into the account via POST /api/v2/wishlist/merge and then cleared here.
 *
 * Mirrors the cart-store pattern (lib/store/cart-store.ts):
 *   - Storage key: "ftt-wishlist-guest-v1"
 *   - Persisted: only { productIds }
 *   - toggle() is idempotent: adding an already-saved id is a no-op.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface GuestWishlistState {
  productIds: string[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  /** Add a product id. No-op if already present. */
  addItem: (productId: string) => void;
  /** Remove a product id. No-op if not present. */
  removeItem: (productId: string) => void;
  /** Toggle membership. */
  toggle: (productId: string) => void;
  /** Check membership. */
  has: (productId: string) => boolean;
  /** Clear all items (called after merge-on-login). */
  clear: () => void;
}

export const useGuestWishlistStore = create<GuestWishlistState>()(
  persist(
    (set, get) => ({
      productIds: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      addItem: (productId) =>
        set((state) => {
          if (state.productIds.includes(productId)) return state; // idempotent
          return { productIds: [...state.productIds, productId] };
        }),

      removeItem: (productId) =>
        set((state) => ({
          productIds: state.productIds.filter((id) => id !== productId),
        })),

      toggle: (productId) => {
        const { addItem, removeItem, has } = get();
        if (has(productId)) {
          removeItem(productId);
        } else {
          addItem(productId);
        }
      },

      has: (productId) => get().productIds.includes(productId),

      clear: () => set({ productIds: [] }),
    }),
    {
      name: "ftt-wishlist-guest-v1",
      version: 1,
      partialize: (state) => ({ productIds: state.productIds }),
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
