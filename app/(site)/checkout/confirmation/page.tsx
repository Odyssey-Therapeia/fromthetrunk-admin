import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ConfirmationPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Order Confirmed
      </p>
      <h1 className="font-serif text-4xl text-foreground">
        Your treasure is reserved
      </h1>
      <p className="text-sm text-muted-foreground">
        This was a simulated checkout. In production, a confirmation email and
        tracking updates will follow.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="rounded-full px-8">
          <Link href="/collection">Continue Shopping</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full px-8">
          <Link href="/">Return Home</Link>
        </Button>
      </div>
    </div>
  );
}
