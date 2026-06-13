"use client";

import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AppVersionBadge } from "@/components/admin/app-version-badge";
import { adminNavItems, adminBottomNavItems } from "@/components/admin/nav-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAgentStore } from "@/lib/store/agent-store";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";
import { cn } from "@/lib/utils";

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { nudge } = useUiHaptics();
  const { toggle: toggleAgent } = useAgentStore();

  const renderLink = (item: (typeof adminNavItems)[number]) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/admin" && pathname.startsWith(item.href));
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground shadow"
            : "text-foreground hover:bg-muted/80",
        )}
        onClick={() => {
          nudge();
          setOpen(false);
        }}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full lg:hidden"
          aria-label="Open admin navigation"
          onClick={nudge}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] border-border/70 bg-card/95 sm:max-w-sm">
        <SheetHeader className="text-left">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>FTT Admin</SheetTitle>
            <AppVersionBadge />
          </div>
          <SheetDescription>Move between dashboard, catalog, and operations.</SheetDescription>
        </SheetHeader>
        <nav className="mt-6 space-y-2">
          {adminNavItems.map(renderLink)}

          <div className="border-t border-border/70 pt-2">
            {adminBottomNavItems.map(renderLink)}
          </div>

          <Button
            onClick={() => {
              nudge();
              toggleAgent();
              setOpen(false);
            }}
            variant="outline"
            className="mt-2 w-full justify-start gap-3 rounded-xl px-4 py-3"
            size="sm"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            AI Assistant
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
