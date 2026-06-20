"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type NewsletterProps = {
  /** Override the email input placeholder (default: "Enter your email") */
  inputPlaceholder?: string;
  /** Override the subscribe button label (default: "Join the list") */
  buttonLabel?: string;
  /** Override the eyebrow label (default: "Private Drops") */
  eyebrow?: string;
  /** Override the section heading (default: "Be the first to discover new arrivals") */
  heading?: string;
  /** Override the body copy (default: "Receive curated drops and stories from the trunk, delivered once a fortnight.") */
  body?: string;
};

export function Newsletter({
  inputPlaceholder = "Enter your email",
  buttonLabel = "Join the list",
  eyebrow,
  heading,
  body,
}: NewsletterProps = {}) {
  const resolvedEyebrow = eyebrow ?? "Private Drops";
  const resolvedHeading = heading ?? "Be the first to discover new arrivals";
  const resolvedBody =
    body ??
    "Receive curated drops and stories from the trunk, delivered once a fortnight.";
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requiresEmailConfirmation, setRequiresEmailConfirmation] =
    useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/v2/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || "Unable to subscribe. Please try again.");
        return;
      }

      const needsConfirmation = Boolean(data.requiresEmailConfirmation);
      setSubmitted(true);
      setRequiresEmailConfirmation(needsConfirmation);
      toast.success(
        data.message ||
          (needsConfirmation
            ? "Check your email to confirm your subscription."
            : "You're subscribed to private drops."),
      );
    } catch {
      toast.error("Unable to subscribe. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <ScrollReveal>
        <Card className="flex flex-col gap-6 border-border/60 bg-white/70 p-8 shadow-soft md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
              {resolvedEyebrow}
            </p>
            <h3 className="font-serif text-2xl text-foreground">
              {resolvedHeading}
            </h3>
            <p className="text-sm text-muted-foreground">{resolvedBody}</p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto">
            <Label
              htmlFor="newsletter-email"
              className="text-xs uppercase tracking-[0.3em] text-muted-foreground"
            >
              Email address
            </Label>
            <form
              className="flex w-full flex-col gap-3 md:flex-row"
              onSubmit={handleSubmit}
            >
              <Input
                id="newsletter-email"
                type="email"
                placeholder={inputPlaceholder}
                className="min-w-65 bg-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitted}
                required
              />
              <Button
                type="submit"
                className="rounded-full px-6"
                disabled={submitted || isLoading}
              >
                {isLoading
                  ? "Subscribing..."
                  : submitted
                    ? requiresEmailConfirmation
                      ? "Check your email"
                      : "You're on the list"
                    : buttonLabel}
              </Button>
            </form>
            {submitted && (
              <p className="text-xs text-muted-foreground">
                {requiresEmailConfirmation
                  ? "We've sent a confirmation link to your email. Click it to complete your subscription."
                  : "You're all set. We'll share curated arrivals and stories with you shortly."}
              </p>
            )}
          </div>
        </Card>
      </ScrollReveal>
    </section>
  );
}
