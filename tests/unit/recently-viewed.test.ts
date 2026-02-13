import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRecentlyViewed,
  getRecentlyViewed,
  trackRecentlyViewed,
} from "@/lib/store/recently-viewed";

// Mock window + localStorage for node environment
const storage = new Map<string, string>();
vi.stubGlobal("window", {});
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

describe("recently viewed", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("tracks a viewed product", () => {
    trackRecentlyViewed({ id: "p1", slug: "saree-a", name: "Saree A", price: 28500, image: "/a.jpg" });
    const items = getRecentlyViewed();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("p1");
    expect(items[0].viewedAt).toBeGreaterThan(0);
  });

  it("puts newest views first", () => {
    trackRecentlyViewed({ id: "p1", slug: "saree-a", name: "Saree A", price: 28500, image: "/a.jpg" });
    trackRecentlyViewed({ id: "p2", slug: "saree-b", name: "Saree B", price: 32000, image: "/b.jpg" });
    const items = getRecentlyViewed();
    expect(items[0].id).toBe("p2");
    expect(items[1].id).toBe("p1");
  });

  it("deduplicates — re-viewing moves to front", () => {
    trackRecentlyViewed({ id: "p1", slug: "saree-a", name: "Saree A", price: 28500, image: "/a.jpg" });
    trackRecentlyViewed({ id: "p2", slug: "saree-b", name: "Saree B", price: 32000, image: "/b.jpg" });
    trackRecentlyViewed({ id: "p1", slug: "saree-a", name: "Saree A", price: 28500, image: "/a.jpg" });
    const items = getRecentlyViewed();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("p1");
  });

  it("excludes a specific ID", () => {
    trackRecentlyViewed({ id: "p1", slug: "saree-a", name: "Saree A", price: 28500, image: "/a.jpg" });
    trackRecentlyViewed({ id: "p2", slug: "saree-b", name: "Saree B", price: 32000, image: "/b.jpg" });
    const items = getRecentlyViewed("p2");
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("p1");
  });

  it("clears all viewed items", () => {
    trackRecentlyViewed({ id: "p1", slug: "saree-a", name: "Saree A", price: 28500, image: "/a.jpg" });
    clearRecentlyViewed();
    expect(getRecentlyViewed()).toHaveLength(0);
  });

  it("caps at 12 items", () => {
    for (let i = 0; i < 15; i++) {
      trackRecentlyViewed({ id: `p${i}`, slug: `saree-${i}`, name: `Saree ${i}`, price: 10000 + i, image: `/${i}.jpg` });
    }
    const items = getRecentlyViewed();
    expect(items.length).toBeLessThanOrEqual(12);
    expect(items.length).toBeGreaterThan(0);
    // Most recent should be first
    expect(items[0].id).toBe("p14");
    // Oldest should have been evicted
    expect(items.find((item) => item.id === "p0")).toBeUndefined();
  });
});
