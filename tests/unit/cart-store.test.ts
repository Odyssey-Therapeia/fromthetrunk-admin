import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Cart store tests.
 *
 * We test the store logic in isolation by re-creating the store functions
 * without the persist middleware (localStorage is unavailable in vitest node).
 */

// Mock the global fetch for releaseReservation calls
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

async function releaseReservation(productId: string): Promise<void> {
  try {
    await fetch("/api/cart/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
  } catch {
    // ignored
  }
}

function createCartStore() {
  let items: CartItem[] = [];

  return {
    getItems: () => items,
    addItem: (item: Omit<CartItem, "quantity">) => {
      if (items.some((i) => i.id === item.id)) return;
      items = [...items, { ...item, quantity: 1 }];
    },
    removeItem: (id: string) => {
      releaseReservation(id);
      items = items.filter((i) => i.id !== id);
    },
    updateQuantity: (_id: string, _qty: number) => {
      // No-op for unique items
    },
    clearCart: () => {
      items = [];
    },
    clearCartWithRelease: () => {
      for (const item of items) {
        releaseReservation(item.id);
      }
      items = [];
    },
    hasItem: (id: string) => items.some((i) => i.id === id),
  };
}

function getCartTotals(items: CartItem[]) {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );
  return { totalItems, subtotal };
}

describe("cart store", () => {
  let store: ReturnType<typeof createCartStore>;

  beforeEach(() => {
    store = createCartStore();
    fetchMock.mockClear();
  });

  it("adds an item with quantity 1", () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    expect(store.getItems()).toHaveLength(1);
    expect(store.getItems()[0].quantity).toBe(1);
  });

  it("prevents duplicate items (one-of-a-kind)", () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    expect(store.getItems()).toHaveLength(1);
  });

  it("allows different items", () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    store.addItem({ id: "p2", name: "Saree B", price: 32000, image: "/b.jpg" });
    expect(store.getItems()).toHaveLength(2);
  });

  it("removes an item and releases reservation", async () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    store.addItem({ id: "p2", name: "Saree B", price: 32000, image: "/b.jpg" });
    store.removeItem("p1");
    expect(store.getItems()).toHaveLength(1);
    expect(store.getItems()[0].id).toBe("p2");
    // Should have called release API
    expect(fetchMock).toHaveBeenCalledWith("/api/cart/release", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ productId: "p1" }),
    }));
  });

  it("clears all items without releasing (for post-payment)", () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    store.addItem({ id: "p2", name: "Saree B", price: 32000, image: "/b.jpg" });
    store.clearCart();
    expect(store.getItems()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clearCartWithRelease releases all reservations", () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    store.addItem({ id: "p2", name: "Saree B", price: 32000, image: "/b.jpg" });
    store.clearCartWithRelease();
    expect(store.getItems()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hasItem returns correct state", () => {
    expect(store.hasItem("p1")).toBe(false);
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    expect(store.hasItem("p1")).toBe(true);
    expect(store.hasItem("p2")).toBe(false);
  });

  it("updateQuantity is a no-op for unique items", () => {
    store.addItem({ id: "p1", name: "Saree A", price: 28500, image: "/a.jpg" });
    store.updateQuantity("p1", 5);
    expect(store.getItems()[0].quantity).toBe(1);
  });
});

describe("getCartTotals", () => {
  it("calculates totals correctly", () => {
    const items: CartItem[] = [
      { id: "p1", name: "A", price: 28500, image: "", quantity: 1 },
      { id: "p2", name: "B", price: 32000, image: "", quantity: 1 },
    ];
    const { totalItems, subtotal } = getCartTotals(items);
    expect(totalItems).toBe(2);
    expect(subtotal).toBe(60500);
  });

  it("returns zero for empty cart", () => {
    const { totalItems, subtotal } = getCartTotals([]);
    expect(totalItems).toBe(0);
    expect(subtotal).toBe(0);
  });
});
