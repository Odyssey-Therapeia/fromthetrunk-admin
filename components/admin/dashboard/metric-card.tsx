import type { LucideIcon } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
};

export function MetricCard({ label, value, sublabel, icon: Icon }: MetricCardProps) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        )}
      </CardHeader>
    </Card>
  );
}
