"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { formatCurrency } from "@/lib/formatters";
import { getRecentlyViewed, RecentlyViewedItem } from "@/lib/store/recently-viewed";

interface RecentlyViewedProps {
  /** Exclude this product ID (e.g., the current product detail page) */
  excludeId?: string;
  /** Maximum items to show */
  limit?: number;
}

export function RecentlyViewed({ excludeId, limit = 6 }: RecentlyViewedProps) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed(excludeId).slice(0, limit));
  }, [excludeId, limit]);

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
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
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
