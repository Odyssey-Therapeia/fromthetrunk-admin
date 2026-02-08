"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";

import { Button } from "@/components/ui/button";

const providerLabels: Record<string, string> = {
  "azure-ad": "Continue with Microsoft",
  google: "Continue with Google",
  twitter: "Continue with X",
};

export default function SignInPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const [providers, setProviders] = useState<ClientSafeProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadProviders = async () => {
      try {
        const availableProviders = await getProviders();
        if (!isActive) {
          return;
        }

        const values = Object.values(availableProviders ?? {});
        setProviders(values);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadProviders();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-6 py-16">
      <div className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Sign In
        </p>
        <h1 className="font-serif text-3xl text-foreground">
          Welcome back to the trunk
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to view your orders and manage your profile.
        </p>
      </div>
      <div className="space-y-3">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Loading sign-in options...
          </p>
        )}

        {!isLoading && providers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 px-5 py-4 text-sm text-muted-foreground">
            No sign-in providers are configured in this environment yet.
          </div>
        )}

        {providers.map((provider) => (
          <Button
            key={provider.id}
            variant="outline"
            className="w-full rounded-full"
            onClick={() =>
              signIn(
                provider.id,
                callbackUrl ? { callbackUrl } : undefined
              )
            }
          >
            {providerLabels[provider.id] ?? `Continue with ${provider.name}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
