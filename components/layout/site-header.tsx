"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SearchBar } from "@/components/layout/search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import logoMark from "@/logos/image 8 [Vectorized].png";

const NAV_ITEMS = [
  { href: "/collection", label: "Collection", strong: true },
  { href: "/collection?tags=top-pick", label: "Top Pick" },
  { href: "/collection?type=blouse", label: "Blouses" },
  { href: "/#connect", label: "Connect With Us" },
  { href: "/#our-story", label: "Our Story" },
  { href: "/faqs", label: "FAQ & Policies" },
];

const SHOP_BY_ITEMS = [
  { href: "/collection?tags=season", label: "Season" },
  { href: "/collection?tags=occasion", label: "Occasion" },
];

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c1.1-3.6 3.3-5.4 6.5-5.4s5.4 1.8 6.5 5.4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M19.5 5.8c-1.8-1.8-4.7-1.6-6.4.4L12 7.5l-1.1-1.3c-1.7-2-4.6-2.2-6.4-.4-1.9 1.9-1.9 5 0 6.9L12 20l7.5-7.3c1.9-1.9 1.9-5 0-6.9Z" />
    </svg>
  );
}

export function SiteHeader() {
  const { data: session } = useSession();
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#F8F4EF]/95 backdrop-blur">
      <AnnouncementBar />
      <div className="border-b border-[#3C0C0F]/10">
        <div className="flex h-16 w-full items-stretch justify-between gap-4 px-5 md:px-8 lg:px-10 xl:px-14">
          <div className="flex min-w-0 flex-1 items-center gap-8 xl:gap-10">
            <Link href="/" className="flex h-full shrink-0 items-center">
              <Image
                src={logoMark}
                alt="From the Trunk"
                width={136}
                height={64}
                className="h-[3.85rem] w-auto object-contain"
                priority
              />
              <span className="sr-only">From the Trunk</span>
            </Link>

            <nav className="hidden min-w-0 flex-1 items-center justify-start gap-5 lg:flex xl:gap-7">
              {NAV_ITEMS.slice(0, 2).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`whitespace-nowrap text-[15px] tracking-[0.035em] text-[#3C0C0F]/82 transition hover:text-[#3C0C0F] ${
                    link.strong ? "font-bold text-[#3C0C0F]" : "font-semibold"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="group relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#3C0C0F]/82 transition hover:text-[#3C0C0F]"
                >
                  Shop By
                  <span className="text-[#AA8657]" aria-hidden="true">
                    ⌄
                  </span>
                </button>
                <div className="invisible absolute left-1/2 top-full z-50 mt-4 w-48 -translate-x-1/2 rounded-xl border border-[#3C0C0F]/10 bg-[#F8F4EF] p-2 opacity-0 shadow-xl shadow-[#3C0C0F]/10 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {SHOP_BY_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-lg px-4 py-3 text-sm font-semibold text-[#3C0C0F]/75 transition hover:bg-[#3C0C0F] hover:text-[#AA8657]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
              {NAV_ITEMS.slice(2).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="whitespace-nowrap text-[15px] font-semibold tracking-[0.035em] text-[#3C0C0F]/82 transition hover:text-[#3C0C0F]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="ml-auto flex h-full shrink-0 items-center justify-end gap-1.5 text-[#3C0C0F]">
            <SearchBar />

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative rounded-full hover:bg-[#3C0C0F]/8 hover:text-[#3C0C0F]"
            >
              <Link
                href={session ? "/account/profile" : "/account/sign-in"}
                aria-label={session ? "Your account" : "Sign in"}
              >
                <AccountIcon />
                {session && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#AA8657]" />
                )}
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative rounded-full hover:bg-[#3C0C0F]/8 hover:text-[#3C0C0F]"
            >
              <Link href="/account/wishlist" aria-label="Liked products">
                <HeartIcon />
              </Link>
            </Button>

            {hasMounted ? (
              <>
                <CartDrawer />

                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      aria-label="Open menu"
                    >
                      <MenuIcon />
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="bg-[#F8F4EF]">
                    <SheetTitle className="sr-only">
                      Mobile navigation
                    </SheetTitle>
                    <div className="flex h-full flex-col gap-6 pt-8">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (mobileSearch.trim().length >= 2) {
                            router.push(
                              `/search?q=${encodeURIComponent(mobileSearch.trim())}`,
                            );
                            setMobileSearch("");
                            setMobileMenuOpen(false);
                          }
                        }}
                        className="relative"
                      >
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3C0C0F]/50">
                          <SearchIcon />
                        </span>
                        <Input
                          value={mobileSearch}
                          onChange={(e) => setMobileSearch(e.target.value)}
                          placeholder="Search sarees..."
                          className="border-[#3C0C0F]/15 bg-white pl-9"
                          aria-label="Search products"
                        />
                      </form>

                      {NAV_ITEMS.slice(0, 2).map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`text-lg text-[#3C0C0F] ${link.strong ? "font-bold" : "font-medium"}`}
                        >
                          {link.label}
                        </Link>
                      ))}
                      <div className="grid gap-3 border-y border-[#3C0C0F]/10 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#AA8657]">
                          Shop By
                        </p>
                        {SHOP_BY_ITEMS.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className="text-lg font-medium text-[#3C0C0F]"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                      {NAV_ITEMS.slice(2).map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="text-lg font-medium text-[#3C0C0F]"
                        >
                          {link.label}
                        </Link>
                      ))}
                      <Link
                        href={session ? "/account/profile" : "/account/sign-in"}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-lg font-medium text-[#3C0C0F]"
                      >
                        {session ? "Account" : "Sign In"}
                      </Link>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full"
                  aria-label="View cart"
                  disabled
                >
                  <span className="h-5 w-5 rounded-lg border border-current" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                  disabled
                >
                  <MenuIcon />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
