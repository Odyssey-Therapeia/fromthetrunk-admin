"use client";

import Link from "next/link";
import {
  ArrowUpDown,
  Download,
  Grid2X2,
  Images,
  LayoutGrid,
  Plus,
  Search,
  Rows3,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_SORT_OPTIONS } from "@/lib/products/sort";
import { cn } from "@/lib/utils";

import type { ProductViewMode } from "./types";

export const ADMIN_PRODUCT_SORT_OPTIONS = [
  ...PRODUCT_SORT_OPTIONS,
  {
    label: "Name: A to Z",
    value: "name-a-z",
  },
  {
    label: "Most photos",
    value: "images-high-to-low",
  },
  {
    label: "Missing cover first",
    value: "missing-cover-first",
  },
] as const;

export type AdminProductSort = (typeof ADMIN_PRODUCT_SORT_OPTIONS)[number]["value"];

export type ImageFilter = "all" | "with-images" | "missing-cover";

const viewOptions: Array<{
  icon: typeof LayoutGrid;
  label: string;
  value: ProductViewMode;
}> = [
  { icon: LayoutGrid, label: "Cards", value: "cards" },
  { icon: Images, label: "Gallery", value: "gallery" },
  { icon: Rows3, label: "List", value: "list" },
  { icon: Grid2X2, label: "Compact", value: "compact" },
];

type ProductsToolbarProps = {
  imageFilter: ImageFilter;
  onImageFilterChange: (value: ImageFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: AdminProductSort;
  onSortChange: (value: AdminProductSort) => void;
  status: string;
  onStatusChange: (value: string) => void;
  stockStatus: string;
  onStockStatusChange: (value: string) => void;
  onExport: () => void;
  viewMode: ProductViewMode;
  onViewModeChange: (value: ProductViewMode) => void;
};

export function ProductsToolbar({
  imageFilter,
  onImageFilterChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  status,
  onStatusChange,
  stockStatus,
  onStockStatusChange,
  onExport,
  viewMode,
  onViewModeChange,
}: ProductsToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 lg:max-w-[420px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search products..."
            aria-label="Search products"
            className="h-10 rounded-xl border-border/70 bg-background/80 pl-9 shadow-sm transition-shadow focus-visible:shadow-md"
          />
        </div>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="h-10 w-[142px] rounded-xl bg-background/80">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>

        <Select value={stockStatus} onValueChange={onStockStatusChange}>
          <SelectTrigger className="h-10 w-[136px] rounded-xl bg-background/80">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={imageFilter}
          onValueChange={(value) => onImageFilterChange(value as ImageFilter)}
        >
          <SelectTrigger className="h-10 w-[154px] rounded-xl bg-background/80">
            <SelectValue placeholder="Images" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Images</SelectItem>
            <SelectItem value="with-images">With Images</SelectItem>
            <SelectItem value="missing-cover">Missing Cover</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(value) => onSortChange(value as AdminProductSort)}
        >
          <SelectTrigger className="h-10 w-[186px] rounded-xl bg-background/80">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_PRODUCT_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-10 gap-1.5 rounded-xl">
            <Link href="/admin/products/import">
              <Upload className="h-3.5 w-3.5" />
              Import
            </Link>
          </Button>
          <Button onClick={onExport} variant="outline" size="sm" className="h-10 gap-1.5 rounded-xl">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button asChild size="sm" className="h-10 gap-1.5 rounded-xl">
            <Link href="/admin/products/new">
              <Plus className="h-3.5 w-3.5" />
              New Product
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 p-1 shadow-sm backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {viewOptions.map((option) => {
            const Icon = option.icon;
            const active = viewMode === option.value;

            return (
              <Button
                aria-pressed={active}
                className={cn(
                  "h-9 shrink-0 gap-1.5 rounded-lg px-3 transition-all",
                  active && "shadow-sm",
                )}
                key={option.value}
                onClick={() => onViewModeChange(option.value)}
                size="sm"
                type="button"
                variant={active ? "default" : "ghost"}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </Button>
            );
          })}
        </div>
        <p className="hidden shrink-0 pr-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
          {viewOptions.find((option) => option.value === viewMode)?.label} view
        </p>
      </div>
    </div>
  );
}
