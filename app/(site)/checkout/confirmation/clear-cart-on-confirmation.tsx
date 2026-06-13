"use client";

import { useEffect } from "react";

import { useCartStore } from "@/lib/store/cart-store";

export function ClearCartOnConfirmation() {
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return null;
}
