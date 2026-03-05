"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { adminNavItems } from "@/components/admin/nav-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";
import { cn } from "@/lib/utils";

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { nudge } = useUiHaptics();

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
          <SheetTitle>FTT Admin</SheetTitle>
          <SheetDescription>Move between dashboard, catalog, and operations.</SheetDescription>
        </SheetHeader>
        <nav className="mt-6 space-y-2">
          {adminNavItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-foreground hover:bg-muted/80"
                )}
                onClick={() => {
                  nudge();
                  setOpen(false);
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
