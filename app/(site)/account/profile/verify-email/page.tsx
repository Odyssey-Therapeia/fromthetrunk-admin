"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";

type VerifyResult = { status: "loading" | "success" | "error"; message?: string };

export default function VerifyEmailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  // Start in "loading" state — the async fetch updates it to success or error.
  const [result, setResult] = useState<VerifyResult>({ status: "loading" });
  const hasFetched = useRef(false);

  const isSessionReady = sessionStatus !== "loading";
  const isAuthenticated = Boolean(session?.user?.id);
  const token = searchParams.get("token");

  useEffect(() => {
    if (!isSessionReady) return;
    if (!isAuthenticated) return;
    if (!token) return;
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch(`/api/v2/users/me/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setResult({ status: "success" });
        } else {
          const json = (await res.json().catch(() => null)) as { message?: string } | null;
          setResult({
            status: "error",
            message: json?.message ?? "The verification link is invalid or has expired.",
          });
        }
      })
      .catch(() => {
        setResult({ status: "error", message: "Something went wrong. Please try again." });
      });
  }, [isSessionReady, isAuthenticated, token]);

  // Session still loading
  if (!isSessionReady) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">Verifying your email address...</p>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-xl space-y-4 rounded-2xl border border-dashed border-border/70 p-6">
        <p className="text-sm text-muted-foreground">
          Please sign in to confirm your email change.
        </p>
        <Button asChild variant="link" className="px-0">
          <Link href="/account/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  // No token in the URL — derive error without setState in effect
  if (!token) {
    return (
      <div className="max-w-xl space-y-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <h2 className="font-serif text-2xl text-foreground">Verification failed</h2>
        <p className="text-sm text-destructive">No verification token provided.</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/account/profile">Back to profile</Link>
        </Button>
      </div>
    );
  }

  if (result.status === "loading") {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">Verifying your email address...</p>
      </div>
    );
  }

  if (result.status === "success") {
    return (
      <div className="max-w-xl space-y-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <h2 className="font-serif text-2xl text-foreground">Email updated</h2>
        <p className="text-sm text-muted-foreground">
          Your email address has been successfully verified and updated.
        </p>
        <Button asChild className="rounded-full">
          <Link href="/account/profile">Back to profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
      <h2 className="font-serif text-2xl text-foreground">Verification failed</h2>
      <p className="text-sm text-destructive">{result.message}</p>
      <Button asChild variant="outline" className="rounded-full">
        <Link href="/account/profile">Back to profile</Link>
      </Button>
    </div>
  );
}
