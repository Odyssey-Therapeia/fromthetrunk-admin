import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Page Not Found
      </p>
      <h1 className="font-serif text-4xl text-foreground md:text-5xl">
        This piece isn&apos;t in the trunk
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page you&apos;re looking for may have been moved or no longer exists.
        Explore the collection to discover something new.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="rounded-full px-8">
          <Link href="/collection">Browse the Collection</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full px-8">
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  );
}
