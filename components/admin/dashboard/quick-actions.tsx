"use client";

import Link from "next/link";
import { Package, ShoppingCart, Sparkles, Upload } from "lucide-react";

import { useAgentStore } from "@/lib/store/agent-store";

const actions = [
  { href: "/admin/products/new", label: "New Product", icon: Package },
  { href: "/admin/orders", label: "View Orders", icon: ShoppingCart },
  { href: "/admin/products/import", label: "Import Products", icon: Upload },
] as const;

export function QuickActions() {
  const { open: openAgent } = useAgentStore();

  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/85 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary"
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={openAgent}
        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/85 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary"
      >
        <Sparkles className="h-4 w-4" />
        AI Assistant
      </button>
    </div>
  );
}
