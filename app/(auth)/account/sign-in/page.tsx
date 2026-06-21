"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";
import type { ClientSafeProvider } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";

const providerLabels: Record<string, string> = {
  "azure-ad": "Continue with Microsoft",
  google: "Continue with Google",
  twitter: "Continue with X",
};

function SignInShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-50">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col justify-center">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </main>
  );
}

function AdminSignInFallback() {
  return (
    <SignInShell>
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">
        From the Trunk
      </p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Admin sign in
      </h1>

      <p className="mt-3 text-sm leading-6 text-neutral-400">
        Loading sign-in options...
      </p>
    </SignInShell>
  );
}

function AdminSignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get("callbackUrl");
  const prefilledEmail = searchParams.get("email") ?? "";

  const [providers, setProviders] = useState<ClientSafeProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  const resolvedCallbackUrl = buildClientCallbackUrl(callbackUrl, "/admin");

  useEffect(() => {
    let isActive = true;

    const loadProviders = async () => {
      try {
        const availableProviders = await getProviders();

        if (!isActive) {
          return;
        }

        const values = Object.values(availableProviders ?? {}).filter(
          (provider) => provider.id !== "credentials",
        );

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
    <SignInShell>
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">
        From the Trunk
      </p>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Admin sign in
      </h1>

      <p className="mt-3 text-sm leading-6 text-neutral-400">
        Sign in with an admin account to manage products, orders, collections,
        content, and operations.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();

          if (!email.trim() || !password || isSubmittingCredentials) {
            return;
          }

          setCredentialsError(null);
          setIsSubmittingCredentials(true);

          try {
            const result = await signIn("credentials", {
              redirect: false,
              email: email.trim(),
              password,
              callbackUrl: resolvedCallbackUrl,
            });

            if (!result || result.error) {
              setCredentialsError("Invalid email or password.");
              return;
            }

            router.push(resolvedCallbackUrl);
            router.refresh();
          } finally {
            setIsSubmittingCredentials(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="bg-white text-neutral-950"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="bg-white text-neutral-950"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmittingCredentials}
        >
          {isSubmittingCredentials ? "Signing in..." : "Sign in"}
        </Button>

        {credentialsError && (
          <p className="text-sm text-red-300">{credentialsError}</p>
        )}
      </form>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <p className="text-sm text-neutral-400">
            Loading sign-in options...
          </p>
        )}

        {!isLoading && providers.length === 0 && (
          <p className="text-sm text-neutral-400">
            No social sign-in providers are configured in this environment.
          </p>
        )}

        {providers.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            className="w-full border-white/15 bg-transparent text-neutral-50 hover:bg-white/10 hover:text-neutral-50"
            onClick={() => {
              void signIn(provider.id, {
                callbackUrl: resolvedCallbackUrl,
              });
            }}
          >
            {providerLabels[provider.id] ?? `Continue with ${provider.name}`}
          </Button>
        ))}
      </div>
    </SignInShell>
  );
}

export default function AdminSignInPage() {
  return (
    <Suspense fallback={<AdminSignInFallback />}>
      <AdminSignInContent />
    </Suspense>
  );
}
