"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/payload-types";

const fetchWishlist = async (): Promise<Product[]> => {
  const res = await fetch("/api/account/wishlist");
  if (!res.ok) return [];
  const data = await res.json();
  // API returns full product objects when depth >= 2
  return (data.wishlist ?? []).filter(
    (item: unknown) => typeof item === "object" && item !== null && "id" in (item as Record<string, unknown>)
  ) as Product[];
};

export default function WishlistPage() {
  const { data: session, status } = useSession();

  const { data: products, isLoading, isError } = useQuery({
    queryKey: ["wishlist"],
    queryFn: fetchWishlist,
    enabled: Boolean(session?.user?.id),
  });

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading session...</p>;
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        Please sign in to view your wishlist.{" "}
        <Button asChild variant="link" className="px-0">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const items = products ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">Wishlist</h2>
        <p className="text-sm text-muted-foreground">
          Pieces you&apos;ve saved for later. One of a kind — don&apos;t wait too long.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading wishlist...</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Unable to load wishlist.</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
          <p>No saved pieces yet.</p>
          <p className="mt-2">
            Tap the heart icon on any saree to save it here.
          </p>
          <Button asChild className="mt-4 rounded-full" variant="outline">
            <Link href="/collection">Browse the Collection</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
