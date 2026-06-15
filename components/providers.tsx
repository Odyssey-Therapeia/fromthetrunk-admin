"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

import { WishlistMergeOnLogin } from "@/components/wishlist/wishlist-merge-on-login";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {/* Session-scoped guest wishlist merge — runs on every page after login,
            not only on pages that happen to mount a WishlistButton. */}
        <WishlistMergeOnLogin />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-sans)",
              borderRadius: "0.75rem",
            },
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  );
}
