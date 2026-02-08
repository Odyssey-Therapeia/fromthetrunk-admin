import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ProductCardProps {
  product: any;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const primaryImage = resolveMediaURL(product.images?.[0]);

  return (
    <Card
      className={cn(
        "group transform-gpu overflow-hidden border-border/60 bg-card/80 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-trunk-gold/40 hover:shadow-lift focus-within:shadow-lift",
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
              className="object-cover transition duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-xs uppercase tracking-[0.2em] text-muted-foreground">
              No image
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
          {product.originalPrice && (
            <Badge className="absolute left-4 top-4 bg-white/85 text-trunk-brown shadow-soft">
              Pre-loved
            </Badge>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg text-foreground">
                {product.name}
              </h3>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {product.details?.fabric ?? "Heirloom"}
              </p>
            </div>
            <ArrowUpRight className="mt-1 h-5 w-5 text-muted-foreground transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {formatCurrency(product.price ?? 0)}
            </span>
            {product.originalPrice && (
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
