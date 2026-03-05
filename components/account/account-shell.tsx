"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Heart, LogOut, MapPin, Package, User } from "lucide-react";
import { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { buildClientCallbackUrl } from "@/lib/auth/client-callback-url";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/account/profile", label: "Profile", icon: User },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
];

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { nudge } = useUiHaptics();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Account
          </p>
          <h1 className="font-serif text-4xl text-foreground">
            {session?.user?.name
              ? `Welcome, ${session.user.name.split(" ")[0]}`
              : "Your profile and orders"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your details, saved addresses, and order history.
          </p>
        </div>
        {session && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={async () => {
              nudge();
              const result = await signOut({
                callbackUrl: buildClientCallbackUrl("/", "/"),
                redirect: false,
              });
              router.push(buildClientCallbackUrl(result?.url, "/"));
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "border-trunk-gold/60 bg-trunk-gold/10 text-foreground"
                  : "border-border/60 bg-card/70 text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
