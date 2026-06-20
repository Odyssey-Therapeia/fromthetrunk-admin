"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Command, CornerDownLeft, Package, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useAgentStore } from "@/lib/store/agent-store";
import { AGENT_MODELS } from "@/lib/ports/agent-chat";
import { cn } from "@/lib/utils";

type ProductOption = { id: string; name: string };

function ProductPicker() {
  const { anchoredProductId, anchoredProductName, anchorProduct } =
    useAgentStore();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const {
    data: products = [],
    isLoading,
    error,
  } = useQuery<ProductOption[], Error>({
    queryKey: ["agent-panel", "products"],
    queryFn: async () => {
      const r = await fetch("/api/v2/products?includeDrafts=true&limit=50");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as Array<{ id: string; name: string }>;
      return data.map((p) => ({ id: p.id, name: p.name }));
    },
    enabled: open,
    staleTime: 30_000,
  });
  const loadError = error?.message ?? null;

  const filtered = search
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : products;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1 rounded-full border border-[#444] bg-[#222] pl-3 transition-colors hover:border-[#666]">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 py-1 pr-2 text-left"
          >
            <Package className="h-3 w-3 text-[#777]" />
            {anchoredProductId ? (
              <span className="max-w-35 truncate text-xs font-medium text-[#c9a96e]">
                {anchoredProductName || "Product"}
              </span>
            ) : (
              <span className="text-[10px] text-[#777]">Work in a product</span>
            )}
          </button>
        </PopoverTrigger>
        {anchoredProductId ? (
          <Button
            onClick={() => anchorProduct(null, null)}
            size="icon"
            variant="ghost"
            aria-label="Clear anchored product"
            className="mr-1 h-5 w-5 shrink-0 text-[#666] hover:text-[#ccc]"
          >
            <X className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
      <PopoverContent
        side="top"
        align="start"
        className="w-65 border-[#444] bg-[#222] p-2"
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="mb-2 h-8 border-[#444] bg-[#1a1a1a] text-xs text-[#e5e5e5] placeholder:text-[#666]"
        />
        <div className="max-h-50 overflow-y-auto">
          {isLoading ? (
            <p className="py-2 text-center text-xs text-[#666]">Loading...</p>
          ) : loadError ? (
            <p className="py-2 text-center text-xs text-red-400">
              Failed to load products
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-2 text-center text-xs text-[#666]">
              {products.length === 0 ? "No products" : "No matches"}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  anchorProduct(p.id, p.name);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  p.id === anchoredProductId
                    ? "bg-[#333] text-[#c9a96e]"
                    : "text-[#ccc] hover:bg-[#333]",
                )}
              >
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
        {anchoredProductId && (
          <button
            type="button"
            onClick={() => {
              anchorProduct(null, null);
              setOpen(false);
            }}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-[#999] hover:bg-[#333]"
          >
            Clear — General mode
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function AgentAnchorBar() {
  const {
    modelId,
    setModelId,
    thinkingEnabled,
    setThinkingEnabled,
    thinkingEffort,
    setThinkingEffort,
  } = useAgentStore();

  return (
    <div className="space-y-2 border-t border-[#333] px-3 py-2">
      {/* Product picker + model row */}
      <div className="flex flex-wrap items-center gap-2">
        <ProductPicker />

        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger className="ml-auto h-7 w-auto gap-1 border-[#444] bg-[#222] px-2 text-[10px] text-[#999]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[#444] bg-[#222]">
            {AGENT_MODELS.map((m) => (
              <SelectItem
                key={m.modelId}
                value={m.modelId}
                className="text-xs text-[#ccc]"
              >
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Thinking toggle */}
        <div className="flex items-center gap-1.5">
          <Brain
            className={cn(
              "h-3 w-3",
              thinkingEnabled ? "text-[#c9a96e]" : "text-[#555]",
            )}
          />
          <Switch
            checked={thinkingEnabled}
            onCheckedChange={setThinkingEnabled}
            className="h-4 w-7 data-[state=checked]:bg-[#c9a96e]"
          />
        </div>

        {thinkingEnabled && (
          <Select
            value={thinkingEffort}
            onValueChange={(v) =>
              setThinkingEffort(v as "low" | "medium" | "high" | "max")
            }
          >
            <SelectTrigger className="h-7 w-auto gap-1 border-[#444] bg-[#222] px-2 text-[10px] text-[#999]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#444] bg-[#222]">
              <SelectItem value="low" className="text-xs text-[#ccc]">
                Low
              </SelectItem>
              <SelectItem value="medium" className="text-xs text-[#ccc]">
                Medium
              </SelectItem>
              <SelectItem value="high" className="text-xs text-[#ccc]">
                High
              </SelectItem>
              <SelectItem value="max" className="text-xs text-[#ccc]">
                Max
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-0.5 text-[#555]">
          <Command className="h-3 w-3" />
          <CornerDownLeft className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}
