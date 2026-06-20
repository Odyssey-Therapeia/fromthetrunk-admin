"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";

import { formatCurrency } from "@/lib/formatters";
import {
  getRecentlyViewed,
  RecentlyViewedItem,
} from "@/lib/store/recently-viewed";

interface RecentlyViewedProps {
  /** Exclude this product ID (e.g., the current product detail page) */
  excludeId?: string;
  /** Maximum items to show */
  limit?: number;
}

// Stable empty reference for the server render and hydration. useSyncExternalStore
// uses getServerSnapshot on the server AND for the first client (hydration) render,
// so both agree on "empty" and there is no hydration mismatch before the client
// reads localStorage.
const EMPTY_ITEMS: RecentlyViewedItem[] = [];

// Recently-viewed lives in a client-only store (localStorage), and it is not
// mutated while this widget is mounted -- it changes when the user views a
// product on another page. A no-op subscribe therefore reproduces the previous
// effect's behavior exactly: read once after the client takes over, no live
// cross-tab sync. To add cross-tab updates, subscribe to the window "storage"
// event here and return a matching removeEventListener cleanup.
function subscribeToRecentlyViewed() {
  return () => {};
}

// useSyncExternalStore calls getSnapshot on every render and requires a
// referentially STABLE result whenever the underlying data is unchanged --
// otherwise it re-renders forever ("getSnapshot should be cached"). Because
// getRecentlyViewed().slice() allocates a fresh array on every call, we cache
// per (excludeId, limit) keyed on a content signature and hand back the same
// reference until the contents actually change.
const snapshotCache = new Map<
  string,
  { signature: string; value: RecentlyViewedItem[] }
>();

function readRecentlyViewedSnapshot(
  excludeId: string | undefined,
  limit: number,
): RecentlyViewedItem[] {
  const key = `${limit}|${excludeId ?? ""}`;
  const next = getRecentlyViewed(excludeId).slice(0, limit);
  const signature = next.map((item) => item.id).join(",");
  const cached = snapshotCache.get(key);
  if (cached && cached.signature === signature) {
    return cached.value;
  }
  snapshotCache.set(key, { signature, value: next });
  return next;
}

export function RecentlyViewed({ excludeId, limit = 6 }: RecentlyViewedProps) {
  const items = useSyncExternalStore(
    subscribeToRecentlyViewed,
    () => readRecentlyViewedSnapshot(excludeId, limit),
    () => EMPTY_ITEMS,
  );

  if (items.length === 0) return null;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Recently Viewed
        </p>
        <h2 className="font-serif text-2xl text-foreground">
          Pieces you&apos;ve explored
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/collection/${item.slug}`}
            className="group space-y-2"
          >
            <div className="relative aspect-4/5 overflow-hidden rounded-xl bg-muted">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] uppercase text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div>
              <p className="truncate text-sm font-medium text-foreground group-hover:underline">
                {item.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(item.price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
