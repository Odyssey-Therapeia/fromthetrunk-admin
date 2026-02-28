"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, User } from "lucide-react";
import { useSession } from "next-auth/react";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SearchBar } from "@/components/layout/search-bar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
];

export function SiteHeader() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur">
      <AnnouncementBar />
      <div className="border-b border-border/60">
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

          <div className="flex items-center gap-1">
            <SearchBar />
            <ThemeToggle />

            {/* Account button */}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative rounded-full"
            >
              <Link
                href={session ? "/account/profile" : "/account/sign-in"}
                aria-label={session ? "Your account" : "Sign in"}
              >
                <User className="h-5 w-5" />
                {session && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-trunk-gold" />
                )}
              </Link>
            </Button>

            <CartDrawer />

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
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
                  {/* Mobile search */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (mobileSearch.trim().length >= 2) {
                        router.push(
                          `/search?q=${encodeURIComponent(mobileSearch.trim())}`
                        );
                        setMobileSearch("");
                        setMobileMenuOpen(false);
                      }
                    }}
                    className="relative"
                  >
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={mobileSearch}
                      onChange={(e) => setMobileSearch(e.target.value)}
                      placeholder="Search sarees..."
                      className="pl-9"
                      aria-label="Search products"
                    />
                  </form>

                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-lg font-medium text-foreground"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <Link
                    href={session ? "/account/profile" : "/account/sign-in"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-lg font-medium text-foreground"
                  >
                    {session ? "Account" : "Sign In"}
                  </Link>
                  <Button asChild className="rounded-full px-6">
                    <Link
                      href="/collection"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      View Collection
                    </Link>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
