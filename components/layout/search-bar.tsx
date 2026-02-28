"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import type { Product } from "@/types/payload-types";

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=6`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.docs ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSelect = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        onClick={handleOpen}
        aria-label="Search products"
      >
        <Search className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search sarees..."
            className="w-56 pl-9 pr-8 md:w-72"
            aria-label="Search products"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => {
            setOpen(false);
            setQuery("");
            setResults([]);
          }}
          aria-label="Close search"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Dropdown results */}
      {query.length >= 2 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border/60 bg-background p-2 shadow-lg md:w-96">
          {isLoading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Searching...
            </p>
          ) : results.length === 0 ? (
            <div className="space-y-2 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-muted-foreground">
                Try Banarasi, Kanjeevaram, Silk, or a designer name.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((product) => {
                const image = resolveMediaURL(product.images?.[0]);
                return (
                  <Link
                    key={product.id}
                    href={`/collection/${product.slug}`}
                    onClick={handleSelect}
                    className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-muted/50"
                  >
                    <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {image ? (
                        <Image
                          src={image}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.details?.fabric ?? "Heirloom"} ·{" "}
                        {formatCurrency(product.price)}
                      </p>
                    </div>
                  </Link>
                );
              })}
              <Link
                href={`/search?q=${encodeURIComponent(query)}`}
                onClick={handleSelect}
                className="block rounded-xl p-2 text-center text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                View all results →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
