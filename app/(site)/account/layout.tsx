import Link from "next/link";
import { ReactNode } from "react";

const navLinks = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/orders", label: "Orders" },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          Account
        </p>
        <h1 className="font-serif text-4xl text-foreground">
          Your profile and orders
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your details, saved addresses, and order history.
        </p>
      </div>

      <nav className="flex flex-wrap gap-3">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full border border-border/60 bg-card/70 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div>{children}</div>
    </div>
  );
}
