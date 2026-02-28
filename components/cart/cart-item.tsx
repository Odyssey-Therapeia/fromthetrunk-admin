"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { CartItem as CartItemType, useCartStore } from "@/lib/store/cart-store";

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const removeItem = useCartStore((state) => state.removeItem);

  return (
    <div className="flex gap-4 border-b border-border/60 pb-4">
      <div className="relative h-24 w-20 overflow-hidden rounded-2xl bg-muted">
        {item.image ? (
          <Image src={item.image} alt={item.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-serif text-base text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(item.price)}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-trunk-gold">
              One of a kind
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={() => {
              removeItem(item.id);
              toast(`${item.name} removed from your bag`);
            }}
            aria-label={`Remove ${item.name}`}
            title={`Remove ${item.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
