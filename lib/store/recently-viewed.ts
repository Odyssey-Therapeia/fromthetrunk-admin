/**
 * Recently viewed products tracker.
 *
 * Stores product IDs in localStorage (max 12). Used to show a
 * "Recently Viewed" section on the site.
 */

const STORAGE_KEY = "ftt-recently-viewed-v1";
const MAX_ITEMS = 12;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RecentlyViewedItem {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  viewedAt: number;
}

function getItems(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setItems(items: RecentlyViewedItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Storage full or unavailable
  }
}

export function trackRecentlyViewed(item: Omit<RecentlyViewedItem, "viewedAt">): void {
  const items = getItems().filter((existing) => existing.id !== item.id);
  items.unshift({ ...item, viewedAt: Date.now() });
  setItems(items);
}

export function getRecentlyViewed(excludeId?: string): RecentlyViewedItem[] {
  const now = Date.now();
  return getItems().filter(
    (item) =>
      Boolean(item.image) &&
      now - item.viewedAt < TTL_MS &&
      item.id !== excludeId
  );
}

export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
