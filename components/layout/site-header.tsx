import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import logoMark from "@/logos/image 8 [Vectorized].png";

const navLinks = [
  { href: "/collection", label: "Collection" },
  { href: "/our-story", label: "Our Story" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/account/profile", label: "Account" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logoMark}
            alt="From the Trunk"
            width={120}
            height={48}
            className="h-10 w-auto"
            priority
          />
          <span className="sr-only">From the Trunk</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Button asChild className="rounded-full px-6">
            <Link href="/collection">View Collection</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-3">
          <CartDrawer />
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-background">
              <div className="flex h-full flex-col gap-6 pt-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-lg font-medium text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
                <Button asChild className="rounded-full px-6">
                  <Link href="/collection">View Collection</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
