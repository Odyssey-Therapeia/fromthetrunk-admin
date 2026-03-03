"use client";

import gsap from "gsap";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/globals", label: "Globals" },
  { href: "/admin/settings", label: "Settings" },
];

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
    <aside className="hidden w-64 border-r border-border/70 bg-card/60 px-4 py-6 backdrop-blur lg:block">
      <p className="mb-6 px-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        FTT Admin
      </p>
      <ul ref={listRef} className="space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <li data-nav-item key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
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
