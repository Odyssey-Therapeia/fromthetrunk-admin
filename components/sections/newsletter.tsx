import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function Newsletter() {
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
          <form className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <Input
              type="email"
              placeholder="Enter your email"
              className="min-w-[260px] bg-white"
            />
            <Button type="submit" className="rounded-full px-6">
              Join the list
            </Button>
          </form>
        </Card>
      </ScrollReveal>
    </section>
  );
}
