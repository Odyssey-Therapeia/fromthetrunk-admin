"use client";

import gsap from "gsap";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { AppVersionBadge } from "@/components/admin/app-version-badge";
import {
  adminBottomNavItems,
  adminNavItems,
} from "@/components/admin/nav-items";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/store/agent-store";
import { cn } from "@/lib/utils";

type AdminSidebarProps = {
  user?: {
    id?: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

type AdminNavItem =
  | (typeof adminNavItems)[number]
  | (typeof adminBottomNavItems)[number];

const getInitials = (name: string | null, email: string | null) => {
  if (name && name.trim().length > 0) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return email?.slice(0, 2).toUpperCase() ?? "AD";
};

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const { toggle: toggleAgent, isOpen: agentOpen } = useAgentStore();

  useEffect(() => {
    if (!listRef.current) return;

    const items = listRef.current.querySelectorAll("[data-nav-item]");
    const cleanupFns: Array<() => void> = [];

    items.forEach((item) => {
      const enter = () => {
        gsap.to(item, { duration: 0.2, x: 4 });
      };
      const leave = () => {
        gsap.to(item, { duration: 0.2, x: 0 });
      };

      item.addEventListener("mouseenter", enter);
      item.addEventListener("mouseleave", leave);

      cleanupFns.push(() => {
        item.removeEventListener("mouseenter", enter);
        item.removeEventListener("mouseleave", leave);
      });
    });

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }, []);

  const renderNavItem = (item: AdminNavItem) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/" && pathname.startsWith(item.href));
    const Icon = item.icon;

    return (
      <li data-nav-item key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary text-primary-foreground shadow"
              : "text-foreground hover:bg-muted/80",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-72 shrink-0 overflow-hidden border-r border-border/70 bg-card/75 px-5 py-5 backdrop-blur lg:flex lg:flex-col">
      <div className="mb-5 shrink-0 rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs uppercase tracking-[0.35em] text-muted-foreground">
            FTT Admin
          </p>
          <AppVersionBadge />
        </div>

        <p className="mt-3 text-lg font-semibold text-foreground">
          Control center
        </p>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Products, collections, orders, and storefront content in one place.
        </p>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <ul ref={listRef} className="space-y-1 pb-4">
          {adminNavItems.map(renderNavItem)}
        </ul>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border/70 pt-4">
        <ul className="space-y-1">{adminBottomNavItems.map(renderNavItem)}</ul>

        <Button
          onClick={toggleAgent}
          variant={agentOpen ? "default" : "outline"}
          className="mt-2 w-full justify-start gap-3 rounded-xl px-4 py-3"
          size="sm"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="truncate">AI Assistant</span>
        </Button>

        {user ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl px-4 py-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage
                alt={user.name ?? "Admin"}
                src={user.image ?? undefined}
              />
              <AvatarFallback className="text-xs">
                {getInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.name ?? "Admin"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email ?? ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
