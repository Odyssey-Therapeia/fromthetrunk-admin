"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function SignInPage() {
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
  const resolvedCallbackUrl = buildClientCallbackUrl(callbackUrl, "/account/profile");

  useEffect(() => {
    let isActive = true;

    const loadProviders = async () => {
      try {
        const availableProviders = await getProviders();
        if (!isActive) {
          return;
        }

        const values = Object.values(availableProviders ?? {}).filter(
          (provider) => provider.id !== "credentials"
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
      <form
        className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-5 shadow-soft"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!email.trim() || !password || isSubmittingCredentials) return;

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
          />
        </div>
        <Button type="submit" className="w-full rounded-full" disabled={isSubmittingCredentials}>
          {isSubmittingCredentials ? "Signing in..." : "Sign in"}
        </Button>
        {credentialsError && (
          <p className="text-sm text-destructive">{credentialsError}</p>
        )}
        <p className="text-sm text-muted-foreground">
          New to From the Trunk?{" "}
          <Link
            href="/account/sign-up"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create your account
          </Link>
        </p>
      </form>

      <div className="space-y-3">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground">
            Loading sign-in options...
          </p>
        )}

        {!isLoading && providers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 px-5 py-4 text-sm text-muted-foreground">
            No social sign-in providers are configured in this environment yet.
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
                { callbackUrl: resolvedCallbackUrl }
              )
            }
          >
            {providerLabels[provider.id] ?? `Continue with ${provider.name}`}
          </Button>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border/70 px-5 py-4 text-sm text-muted-foreground">
        Admin access available via{" "}
        <Link href="/admin" className="font-medium text-foreground underline underline-offset-4">
          Admin Console
        </Link>
        .
      </div>
    </div>
  );
}
