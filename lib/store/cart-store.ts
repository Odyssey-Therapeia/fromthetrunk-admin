import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  /** ISO date string — when the server-side reservation expires. */
  reservedUntil?: string | null;
}

/**
 * Release a product reservation on the server.
 * Fire-and-forget — failures are silently ignored since the cron job
 * will clean up expired reservations anyway.
 */
async function releaseReservation(productId: string): Promise<void> {
  try {
    await fetch("/api/v2/cart/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
  } catch {
    // Non-critical — cron will clean up
  }
}

interface CartState {
  items: CartItem[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  /**
   * Add item to cart.  Pre-loved items are one-of-a-kind so adding the same
   * item again is a no-op (quantity stays at 1).
   */
  addItem: (item: Omit<CartItem, "quantity">) => void;
  /**
   * Remove item from cart and release its server-side reservation.
   */
  removeItem: (id: string) => void;
  /**
   * Update quantity — clamped to exactly 1 for unique pre-loved items.
   * Kept for interface compat but enforces max = 1.
   */
  updateQuantity: (id: string, quantity: number) => void;
  /**
   * Clear all items. Does NOT release reservations — used after successful
   * payment when items are already marked as sold.
   */
  clearCart: () => void;
  /**
   * Clear all items AND release their server-side reservations.
   * Used when the user abandons checkout or manually empties the bag.
   */
  clearCartWithRelease: () => void;
  /** Check whether a product is already in the cart. */
  hasItem: (id: string) => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      addItem: (item) =>
        set((state) => {
          // One-of-a-kind — don't add duplicates
          const existing = state.items.find(
            (existingItem) => existingItem.id === item.id
          );
          if (existing) {
            return state; // no-op, already in cart
          }
          return {
            items: [
              ...state.items,
              { ...item, quantity: 1 }, // always qty 1
            ],
          };
        }),
      removeItem: (id) => {
        // Release the server-side reservation
        releaseReservation(id);
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },
      updateQuantity: (_id, _quantity) => {
        // Pre-loved items are unique — quantity is always 1.
        // This is intentionally a no-op to prevent UI bugs.
        return;
      },
      clearCart: () => set({ items: [] }),
      clearCartWithRelease: () => {
        const currentItems = get().items;
        for (const item of currentItems) {
          releaseReservation(item.id);
        }
        set({ items: [] });
      },
      hasItem: (id) => get().items.some((item) => item.id === id),
    }),
    {
      name: "ftt-cart-v2",
      version: 2,
      partialize: (state) => ({ items: state.items }),
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export const getCartTotals = (items: CartItem[]) => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );
  return { totalItems, subtotal };
};
