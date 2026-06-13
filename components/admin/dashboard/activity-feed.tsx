import { Package, ShoppingCart, User } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityItem } from "@/lib/ports/dashboard";

type ActivityFeedProps = {
  items: ActivityItem[];
};

const iconMap = {
  order: ShoppingCart,
  product: Package,
  customer: User,
} as const;

function formatRelativeTime(iso: string) {
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return "Unknown time";
  const diff = Date.now() - parsed;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Latest events across your store.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No recent activity
          </p>
        ) : (
          items.slice(0, 10).map((item) => {
            const Icon = iconMap[item.type] ?? Package;
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
