"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

const providers = [
  { id: "google", label: "Continue with Google" },
  { id: "azure-ad", label: "Continue with Microsoft" },
  { id: "twitter", label: "Continue with X" },
];

export default function SignInPage() {
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
        {providers.map((provider) => (
          <Button
            key={provider.id}
            variant="outline"
            className="w-full rounded-full"
            onClick={() => signIn(provider.id)}
          >
            {provider.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
