"use client";

/**
 * P6-04: RestockNotifyButton — "Notify me if it returns" affordance.
 *
 * Rendered on PDPs when stockStatus is "sold" or "reserved".
 * Captures the restock intent via POST /api/v2/wishlist/notify.
 * The actual restock email is OUT OF SCOPE (future cron).
 */

import { useState } from "react";
import { Bell } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RestockNotifyButtonProps {
  productId: string;
  productName: string;
  className?: string;
}

const emailSchema = z.string().email("Please enter a valid email address");

export function RestockNotifyButton({
  productId,
  productName,
  className,
}: RestockNotifyButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(session?.user?.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/v2/wishlist/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email: parsed.data }),
      });
      if (res.ok) {
        setSubmitted(true);
        toast.success("We'll let you know if this piece becomes available!");
        setOpen(false);
      } else {
        toast.error("Unable to register. Please try again.");
      }
    } catch {
      toast.error("Unable to register. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <Button variant="outline" className={className} disabled>
        <Bell className="mr-2 h-4 w-4" />
        Notify registered
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          <Bell className="mr-2 h-4 w-4" />
          Notify me if it returns
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notify me if it returns</DialogTitle>
          <DialogDescription>
            We&apos;ll send you a message if <strong>{productName}</strong> becomes
            available again. One-of-one pieces occasionally return from
            consignment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="restock-email">Email address</Label>
            <Input
              id="restock-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {emailError && (
              <p className="text-xs text-destructive">{emailError}</p>
            )}
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={pending}>
            {pending ? "Registering…" : "Notify me"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
