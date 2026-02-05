import Image from "next/image";
import Link from "next/link";
import logoMark from "@/logos/image 8 [Vectorized].png";

const footerLinks = [
  {
    title: "Explore",
    links: [
      { href: "/collection", label: "The Collection" },
      { href: "/our-story", label: "Our Story" },
      { href: "/how-it-works", label: "How It Works" },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { href: "/how-it-works", label: "Authentication" },
      { href: "/how-it-works", label: "Shipping" },
      { href: "/how-it-works", label: "Returns" },
    ],
  },
  {
    title: "Connect",
    links: [
      { href: "mailto:hello@fromthetrunk.com", label: "hello@fromthetrunk.com" },
      { href: "https://instagram.com", label: "Instagram" },
      { href: "https://pinterest.com", label: "Pinterest" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-secondary/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.5fr_2fr]">
        <div className="space-y-4">
          <Image
            src={logoMark}
            alt="From the Trunk"
            width={140}
            height={56}
            className="h-12 w-auto"
          />
          <p className="max-w-sm text-sm text-muted-foreground">
            A curated collection of pre-loved luxury sarees. Each piece is
            authenticated, cherished, and ready for a new story.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {footerLinks.map((section) => (
            <div key={section.title} className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-2 text-sm text-foreground">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition hover:text-foreground hover:underline underline-offset-4"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © 2026 From the Trunk. All rights reserved.
      </div>
    </footer>
  );
}
