"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  productName: string;
  className?: string;
}

const fetchWishlist = async (): Promise<Array<string | { id: string }>> => {
  const res = await fetch("/api/account/wishlist");
  if (!res.ok) return [];
  const data = await res.json();
  return data.wishlist ?? [];
};

export function WishlistButton({
  productId,
  productName,
  className,
}: WishlistButtonProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [optimisticWished, setOptimisticWished] = useState<boolean | null>(null);

  const { data: wishlist } = useQuery({
    queryKey: ["wishlist"],
    queryFn: fetchWishlist,
    enabled: Boolean(session?.user?.id),
    staleTime: 30_000,
  });

  const isInWishlist =
    optimisticWished ??
    (wishlist ?? []).some((item) =>
      typeof item === "string" ? item === productId : item.id === productId
    );

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/account/wishlist", {
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
      const res = await fetch("/api/account/wishlist", {
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

  if (!session) return null;

  const isPending = addMutation.isPending || removeMutation.isPending;

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
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isInWishlist) {
          removeMutation.mutate();
        } else {
          addMutation.mutate();
        }
      }}
      aria-label={isInWishlist ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
    >
      <Heart
        className={cn("h-5 w-5 transition", isInWishlist && "fill-current")}
      />
    </Button>
  );
}
