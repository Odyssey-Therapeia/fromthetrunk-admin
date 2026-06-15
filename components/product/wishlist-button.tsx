"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGuestWishlistStore } from "@/lib/store/wishlist-store";

interface WishlistButtonProps {
  productId: string;
  productName: string;
  className?: string;
}

const fetchWishlist = async (): Promise<string[]> => {
  const res = await fetch("/api/v2/wishlist");
  if (!res.ok) return [];
  return (await res.json()) as string[];
};

export function WishlistButton({
  productId,
  productName,
  className,
}: WishlistButtonProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [optimisticWished, setOptimisticWished] = useState<boolean | null>(null);

  // Guest store (localStorage-backed).
  // Merge-on-login is handled by WishlistMergeOnLogin (Providers-level) — no per-button effect needed.
  const guestHas = useGuestWishlistStore((s) => s.has);
  const guestToggle = useGuestWishlistStore((s) => s.toggle);

  // Account-backed wishlist (only when logged in).
  // Key ["wishlist","ids"] — returns string[].
  // Distinct from ["wishlist","products"] used by the wishlist page (returns Product[]).
  // Invalidating ["wishlist"] (prefix) refreshes both.
  const { data: wishlist } = useQuery({
    queryKey: ["wishlist", "ids"],
    queryFn: fetchWishlist,
    enabled: Boolean(session?.user?.id),
    staleTime: 30_000,
  });

  // Determine current saved state: optimistic override → account list → guest list.
  const isInWishlist =
    optimisticWished ??
    (session?.user?.id
      ? (wishlist ?? []).some((item) => item === productId)
      : guestHas(productId));

  // ── Account mutations ──────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v2/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onMutate: () => setOptimisticWished(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success(`${productName} saved to wishlist`);
    },
    onError: () => {
      setOptimisticWished(null);
      toast.error("Unable to save to wishlist");
    },
    onSettled: () => setOptimisticWished(null),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v2/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onMutate: () => setOptimisticWished(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      toast(`${productName} removed from wishlist`);
    },
    onError: () => {
      setOptimisticWished(null);
      toast.error("Unable to remove from wishlist");
    },
    onSettled: () => setOptimisticWished(null),
  });

  const isPending = addMutation.isPending || removeMutation.isPending;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (session?.user?.id) {
      // Logged-in path: persist to account.
      if (isInWishlist) {
        removeMutation.mutate();
      } else {
        addMutation.mutate();
      }
    } else {
      // Guest path: persist to localStorage.
      guestToggle(productId);
      if (!isInWishlist) {
        toast.success(`${productName} saved to wishlist`);
      } else {
        toast(`${productName} removed from wishlist`);
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full transition",
        isInWishlist ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-red-400",
        className
      )}
      disabled={isPending}
      onClick={handleClick}
      aria-label={isInWishlist ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
    >
      <Heart
        className={cn("h-5 w-5 transition", isInWishlist && "fill-current")}
      />
    </Button>
  );
}
