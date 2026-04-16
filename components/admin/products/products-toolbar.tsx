"use client";

import Link from "next/link";
import { Download, Plus, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProductsToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  stockStatus: string;
  onStockStatusChange: (value: string) => void;
  onExport: () => void;
};

export function ProductsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  stockStatus,
  onStockStatusChange,
  onExport,
}: ProductsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 sm:min-w-[200px] sm:max-w-[300px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search products..."
          aria-label="Search products"
          className="pl-9"
        />
      </div>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="published">Published</SelectItem>
        </SelectContent>
      </Select>

      <Select value={stockStatus} onValueChange={onStockStatusChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Stock" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stock</SelectItem>
          <SelectItem value="available">Available</SelectItem>
          <SelectItem value="reserved">Reserved</SelectItem>
          <SelectItem value="sold">Sold</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto flex gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/admin/products/import">
            <Upload className="h-3.5 w-3.5" />
            Import
          </Link>
        </Button>
        <Button onClick={onExport} variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/admin/products/new">
            <Plus className="h-3.5 w-3.5" />
            New Product
          </Link>
        </Button>
      </div>
    </div>
  );
}
