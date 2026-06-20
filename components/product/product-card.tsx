"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { cn } from "@/lib/utils";
import { useLiveProductStock } from "@/lib/realtime/use-live-product-stock";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WishlistButton } from "@/components/product/wishlist-button";
import type { Product, StockStatus } from "@/types/domain";

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const primaryImage = resolveMediaURL(product.images?.[0]);
  const { stockStatus } = useLiveProductStock({
    initialStatus: product.stockStatus as StockStatus,
    productId: product.id,
    productSlug: product.slug,
  });
  const isSold = stockStatus === "sold";
  const isReserved = stockStatus === "reserved";

  return (
    <Card
      className={cn(
        "@container group transform-gpu overflow-hidden border-border/60 bg-card/80 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-trunk-gold/40 hover:shadow-lift focus-within:shadow-lift",
        isSold && "opacity-75",
        className,
      )}
    >
      <Link href={`/collection/${product.slug}`} className="block">
        <div className="relative aspect-3/4 @sm:aspect-4/5 overflow-hidden">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={cn(
                "object-cover transition duration-700 group-hover:scale-105",
                isSold && "grayscale",
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-xs uppercase tracking-[0.2em] text-muted-foreground">
              No image
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-black/25 via-black/0 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />

          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Badge className="bg-foreground/90 text-background shadow-soft">
                Sold
              </Badge>
            </div>
          )}
          {isReserved && (
            <Badge className="absolute left-2 top-2 @sm:left-4 @sm:top-4 text-[10px] @sm:text-xs bg-amber-100/90 text-trunk-brown shadow-soft">
              Reserved
            </Badge>
          )}

          {!isSold && !isReserved && product.originalPricePaise && (
            <Badge className="absolute left-2 top-2 @sm:left-4 @sm:top-4 text-[10px] @sm:text-xs bg-white/85 text-trunk-brown shadow-soft">
              Pre-loved
            </Badge>
          )}

          {!isSold && (
            <div className="absolute right-2 top-2 @sm:right-3 @sm:top-3 z-10">
              <WishlistButton
                productId={product.id}
                productName={product.name}
                className="h-7 w-7 @sm:h-8 @sm:w-8 bg-white/80 shadow-sm backdrop-blur hover:bg-white"
              />
            </div>
          )}
        </div>
        <div className="space-y-1 p-2.5 @sm:space-y-1.5 @sm:p-4">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <h3 className="line-clamp-2 font-serif text-[13px] leading-tight @sm:text-base @md:text-lg text-foreground">
                {product.name}
              </h3>
              <p className="mt-0.5 truncate text-[10px] @sm:text-xs uppercase tracking-[0.12em] @sm:tracking-[0.2em] text-muted-foreground">
                <span>{product.detailsFabric ?? "Heirloom"}</span>
                <span className="hidden @sm:inline">, one of a kind</span>
              </p>
            </div>
            <ArrowUpRight className="mt-0.5 hidden @sm:block h-5 w-5 shrink-0 text-muted-foreground transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="flex items-center gap-1 @sm:gap-2">
            <span
              className={cn(
                "text-xs @sm:text-sm font-semibold",
                isSold
                  ? "text-muted-foreground line-through"
                  : "text-foreground",
              )}
            >
              {formatCurrency(product.pricePaise / 100)}
            </span>
            {product.originalPricePaise && !isSold && (
              <span className="text-[10px] @sm:text-xs text-muted-foreground line-through">
                {formatCurrency(product.originalPricePaise / 100)}
              </span>
            )}
          </div>
          <p className="hidden @sm:block text-sm text-muted-foreground">
            {product.storyTitle ?? "A story from the trunk"}
          </p>
        </div>
      </Link>
    </Card>
  );
}
