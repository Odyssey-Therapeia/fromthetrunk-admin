"use client";

import gsap from "gsap";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { adminNavItems } from "@/components/admin/nav-items";
import { cn } from "@/lib/utils";

export function AdminSidebar() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!listRef.current) return;

    const items = listRef.current.querySelectorAll("[data-nav-item]");
    const cleanupFns: Array<() => void> = [];

    items.forEach((item) => {
      const enter = () => {
        gsap.to(item, {
          duration: 0.2,
          x: 4,
        });
      };

      const leave = () => {
        gsap.to(item, {
          duration: 0.2,
          x: 0,
        });
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

  return (
    <aside className="sticky top-0 hidden h-screen w-72 border-r border-border/70 bg-card/75 px-5 py-6 backdrop-blur lg:block">
      <div className="mb-8 rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          FTT Admin
        </p>
        <p className="mt-3 text-lg font-semibold text-foreground">Control center</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Products, collections, orders, and storefront content in one place.
        </p>
      </div>
      <ul ref={listRef} className="space-y-1">
        {adminNavItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <li data-nav-item key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "block rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-foreground hover:bg-muted/80"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
