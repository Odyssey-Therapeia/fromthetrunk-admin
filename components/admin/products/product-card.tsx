"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEvent } from "react";
import {
  Copy,
  Edit,
  ImageIcon,
  ImageOff,
  PackageCheck,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/db/money";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/lib/hooks/use-products";

import type { ProductViewMode } from "./types";

type ProductCardProps = {
  product: ProductListItem;
  isSelected?: boolean;
  mode?: Exclude<ProductViewMode, "list">;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelectionChange?: (id: string, selected: boolean) => void;
};

type ProductListRowProps = Omit<ProductCardProps, "mode">;

const getImageCountLabel = (count: number) => {
  if (count === 0) return "No images";
  if (count === 1) return "1 image";
  return `${count} images`;
};

const stopClick = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

function SelectionCheckbox({
  isSelected,
  product,
  onSelectionChange,
}: Pick<ProductCardProps, "isSelected" | "onSelectionChange" | "product">) {
  if (!onSelectionChange) return null;

  return (
    <label className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background/90 shadow-sm backdrop-blur transition-transform motion-safe:group-hover:scale-105">
      <input
        aria-label={`Select ${product.name}`}
        checked={Boolean(isSelected)}
        className="h-4 w-4 accent-primary"
        onChange={(event) => onSelectionChange(product.id, event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function ProductStatusBadges({ product }: { product: ProductListItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge
        variant={product.status === "published" ? "default" : "outline"}
        className={cn(
          "h-6 rounded-full px-2 text-[10px] uppercase tracking-wider",
          product.status === "draft" &&
            "border-border bg-background/80 text-muted-foreground backdrop-blur-sm",
        )}
      >
        {product.status}
      </Badge>
      {product.stockStatus !== "available" ? (
        <Badge
          variant="outline"
          className={cn(
            "h-6 rounded-full bg-background/80 px-2 text-[10px] uppercase tracking-wider backdrop-blur-sm",
            product.stockStatus === "reserved"
              ? "border-amber-300 text-amber-700"
              : "border-red-300 text-red-700",
          )}
        >
          {product.stockStatus}
        </Badge>
      ) : null}
    </div>
  );
}

function ProductActions({
  product,
  onDuplicate,
  onDelete,
}: Pick<ProductCardProps, "onDuplicate" | "onDelete" | "product">) {
  return (
    <div className="flex items-center gap-1">
      <Button
        asChild
        size="icon"
        variant="outline"
        aria-label={`Edit ${product.name}`}
        className="h-8 w-8 rounded-lg bg-background/80"
        title="Edit product"
      >
        <Link href={`/admin/products/${product.id}`}>
          <Edit className="h-3.5 w-3.5" />
        </Link>
      </Button>
      {onDuplicate ? (
        <Button
          onClick={(event) => {
            stopClick(event);
            onDuplicate(product.id);
          }}
          size="icon"
          variant="outline"
          aria-label={`Duplicate ${product.name}`}
          className="h-8 w-8 rounded-lg bg-background/80"
          title="Duplicate product"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          onClick={(event) => {
            stopClick(event);
            onDelete(product.id);
          }}
          size="icon"
          variant="destructive"
          aria-label={`Delete ${product.name}`}
          className="ml-auto h-8 w-8 rounded-lg"
          title="Delete product"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function ProductImageFrame({
  mode,
  product,
}: {
  mode: Exclude<ProductViewMode, "list">;
  product: ProductListItem;
}) {
  const imageCount = product.imageCount ?? (product.thumbnailUrl ? 1 : 0);
  const isGallery = mode === "gallery";
  const isCompact = mode === "compact";

  return (
    <Link href={`/admin/products/${product.id}`} className="block">
      <div
        className={cn(
          "relative overflow-hidden bg-muted/30",
          isGallery ? "aspect-[16/10]" : isCompact ? "aspect-square" : "aspect-[3/4]",
        )}
      >
        {product.thumbnailUrl ? (
          <Image
            src={product.thumbnailUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.035]"
            sizes={
              isGallery
                ? "(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                : isCompact
                  ? "(max-width: 768px) 50vw, 16vw"
                  : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2 text-xs">
              <ImageOff className="h-5 w-5" />
              No image
            </div>
          </div>
        )}

        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          <ProductStatusBadges product={product} />
        </div>

        {isGallery ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3 pt-10 text-white">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                <ImageIcon className="h-3 w-3" />
                {getImageCountLabel(imageCount)}
              </span>
              <span className="max-w-[60%] truncate text-[10px] uppercase tracking-[0.16em] text-white/80">
                {product.coverImageFilename ?? "Missing cover"}
              </span>
            </div>
          </div>
        ) : (
          <Badge
            variant="secondary"
            className="absolute bottom-2 left-2 gap-1 rounded-full bg-background/85 text-[10px] text-foreground shadow-sm backdrop-blur-sm"
          >
            <ImageIcon className="h-3 w-3" />
            {getImageCountLabel(imageCount)}
          </Badge>
        )}
      </div>
    </Link>
  );
}

export function ProductCard({
  product,
  isSelected = false,
  mode = "cards",
  onDuplicate,
  onDelete,
  onSelectionChange,
}: ProductCardProps) {
  const imageCount = product.imageCount ?? (product.thumbnailUrl ? 1 : 0);
  const isCompact = mode === "compact";
  const isGallery = mode === "gallery";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-lg motion-safe:hover:-translate-y-0.5",
        isCompact && "rounded-lg",
        isGallery && "rounded-2xl",
        isSelected && "border-primary/70 shadow-md ring-2 ring-primary/25",
      )}
    >
      <div className="relative">
        <div className="absolute left-2 top-2 z-20">
          <SelectionCheckbox
            isSelected={isSelected}
            onSelectionChange={onSelectionChange}
            product={product}
          />
        </div>
        <ProductImageFrame mode={mode} product={product} />
      </div>

      <div className={cn("space-y-3", isCompact ? "p-2.5" : "p-3")}>
        <div className="space-y-1">
          <Link href={`/admin/products/${product.id}`}>
            <h3
              className={cn(
                "font-medium leading-5 transition-colors hover:text-primary",
                isCompact ? "line-clamp-2 min-h-10 text-xs" : "line-clamp-2 min-h-10 text-sm",
                isGallery && "min-h-0 text-base",
              )}
            >
              {product.name}
            </h3>
          </Link>
          <div className="flex items-center justify-between gap-2">
            <p className={cn("font-semibold", isCompact ? "text-sm" : "text-base")}>
              {formatINR(product.pricePaise)}
            </p>
            {product.featured ? (
              <Badge variant="outline" className="rounded-full text-[10px]">
                Featured
              </Badge>
            ) : null}
          </div>
          {!isCompact ? (
            <p
              className="truncate text-xs text-muted-foreground"
              title={product.coverImageFilename ?? undefined}
            >
              {product.coverImageFilename
                ? `Cover: ${product.coverImageFilename}`
                : "Cover image missing"}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          {!isCompact ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5" />
              {product.stockStatus}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {getImageCountLabel(imageCount)}
            </span>
          )}
          <ProductActions product={product} onDuplicate={onDuplicate} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

export function ProductListRow({
  product,
  isSelected = false,
  onDuplicate,
  onDelete,
  onSelectionChange,
}: ProductListRowProps) {
  const imageCount = product.imageCount ?? (product.thumbnailUrl ? 1 : 0);

  return (
    <div
      className={cn(
        "group grid grid-cols-[auto_88px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border/70 bg-card/90 p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md md:grid-cols-[auto_72px_minmax(220px,1fr)_130px_140px_132px]",
        isSelected && "border-primary/70 ring-2 ring-primary/25",
      )}
    >
      <div className="flex items-start">
        <SelectionCheckbox
          isSelected={isSelected}
          onSelectionChange={onSelectionChange}
          product={product}
        />
      </div>

      <Link
        href={`/admin/products/${product.id}`}
        className="relative h-24 w-[88px] overflow-hidden rounded-lg bg-muted/30 md:h-[88px] md:w-[72px]"
      >
        {product.thumbnailUrl ? (
          <Image
            src={product.thumbnailUrl}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
            sizes="96px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" />
          </div>
        )}
      </Link>

      <div className="min-w-0 space-y-1">
        <Link href={`/admin/products/${product.id}`}>
          <h3 className="line-clamp-1 text-sm font-semibold transition-colors hover:text-primary">
            {product.name}
          </h3>
        </Link>
        <p className="truncate text-xs text-muted-foreground">{product.slug}</p>
        <p className="truncate text-xs text-muted-foreground">
          {product.coverImageFilename ?? "Cover image missing"}
        </p>
        <div className="flex flex-wrap gap-1 md:hidden">
          <ProductStatusBadges product={product} />
        </div>
      </div>

      <div className="hidden items-center md:flex">
        <ProductStatusBadges product={product} />
      </div>

      <div className="col-span-2 col-start-2 flex items-center justify-between gap-3 md:col-auto md:block">
        <p className="text-sm font-semibold">{formatINR(product.pricePaise)}</p>
        <p className="text-xs text-muted-foreground">{getImageCountLabel(imageCount)}</p>
      </div>

      <div className="col-span-3 flex items-center justify-end md:col-auto">
        <ProductActions product={product} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
    </div>
  );
}
