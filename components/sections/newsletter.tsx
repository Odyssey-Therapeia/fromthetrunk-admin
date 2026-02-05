"use client";

import { useState } from "react";

import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Newsletter() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <ScrollReveal>
        <Card className="flex flex-col gap-6 border-border/60 bg-white/70 p-8 shadow-soft md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
              Private Drops
            </p>
            <h3 className="font-serif text-2xl text-foreground">
              Be the first to discover new arrivals
            </h3>
            <p className="text-sm text-muted-foreground">
              Receive curated drops and stories from the trunk, delivered once a
              fortnight.
            </p>
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
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
              }}
            >
              <Input
                id="newsletter-email"
                type="email"
                placeholder="Enter your email"
                className="min-w-[260px] bg-white"
                disabled={submitted}
                aria-disabled={submitted}
              />
              <Button type="submit" className="rounded-full px-6" disabled={submitted}>
                {submitted ? "You're on the list" : "Join the list"}
              </Button>
            </form>
            {submitted && (
              <p className="text-xs text-muted-foreground">
                Thanks! We&apos;ll email you the next curated drop.
              </p>
            )}
          </div>
        </Card>
      </ScrollReveal>
    </section>
  );
}
