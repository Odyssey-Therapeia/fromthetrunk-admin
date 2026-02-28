import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WishlistButton } from "@/components/product/wishlist-button";
import type { Product, StockStatus } from "@/types/payload-types";

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const primaryImage = resolveMediaURL(product.images?.[0]);
  const stockStatus: StockStatus = product.stockStatus ?? "available";
  const isSold = stockStatus === "sold";
  const isReserved = stockStatus === "reserved";

  return (
    <Card
      className={cn(
        "group transform-gpu overflow-hidden border-border/60 bg-card/80 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-trunk-gold/40 hover:shadow-lift focus-within:shadow-lift",
        isSold && "opacity-75",
        className
      )}
    >
      <Link href={`/collection/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className={cn(
                "object-cover transition duration-700 group-hover:scale-105",
                isSold && "grayscale"
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-xs uppercase tracking-[0.2em] text-muted-foreground">
              No image
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />

          {/* Stock status overlay */}
          {isSold && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Badge className="bg-foreground/90 text-background shadow-soft">
                Sold
              </Badge>
            </div>
          )}
          {isReserved && (
            <Badge className="absolute left-4 top-4 bg-amber-100/90 text-trunk-brown shadow-soft">
              Reserved
            </Badge>
          )}

          {/* Pre-loved badge */}
          {!isSold && !isReserved && product.originalPrice && (
            <Badge className="absolute left-4 top-4 bg-white/85 text-trunk-brown shadow-soft">
              Pre-loved
            </Badge>
          )}

          {/* Wishlist button */}
          {!isSold && (
            <div className="absolute right-3 top-3 z-10">
              <WishlistButton
                productId={product.id}
                productName={product.name}
                className="h-8 w-8 bg-white/80 shadow-sm backdrop-blur hover:bg-white"
              />
            </div>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg text-foreground">
                {product.name}
              </h3>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {product.details?.fabric ?? "Heirloom"} · One of a kind
              </p>
            </div>
            <ArrowUpRight className="mt-1 h-5 w-5 text-muted-foreground transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-semibold",
              isSold ? "text-muted-foreground line-through" : "text-foreground"
            )}>
              {formatCurrency(product.price ?? 0)}
            </span>
            {product.originalPrice && !isSold && (
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(product.originalPrice)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {product.story?.title ?? "A story from the trunk"}
          </p>
        </div>
      </Link>
    </Card>
  );
}
