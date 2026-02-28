"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-destructive">
        Something went wrong
      </p>
      <h1 className="font-serif text-4xl text-foreground md:text-5xl">
        An unexpected error occurred
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        We apologise for the inconvenience. Please try again, or return to the
        collection if the issue persists.
      </p>
      {process.env.NODE_ENV === "development" && error.message && (
        <pre className="max-w-full overflow-auto rounded-xl border border-border/60 bg-card/70 p-4 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} className="rounded-full px-8">
          Try Again
        </Button>
        <Button asChild variant="outline" className="rounded-full px-8">
          <Link href="/collection">Browse Collection</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-full px-8">
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  );
}
