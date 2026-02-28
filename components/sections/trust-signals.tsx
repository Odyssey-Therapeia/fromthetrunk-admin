import { ShieldCheck, Sparkles, Users } from "lucide-react";

const trustStats = [
  {
    label: "Authenticated Sarees",
    value: "200+",
    icon: ShieldCheck,
  },
  {
    label: "Happy Collectors",
    value: "50+",
    icon: Users,
  },
  {
    label: "Provenance Verified",
    value: "100%",
    icon: Sparkles,
  },
];

export function TrustSignals() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6">
      <div className="grid gap-4 rounded-2xl border border-border/60 bg-card/70 p-5 shadow-soft md:grid-cols-3 md:p-6">
        {trustStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/70 px-4 py-3"
            >
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-serif text-xl text-foreground">{stat.value}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
