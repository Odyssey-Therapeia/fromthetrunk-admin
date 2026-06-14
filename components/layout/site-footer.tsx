import Image from "next/image";
import Link from "next/link";
import { Instagram, MessageCircle } from "lucide-react";
import logoMark from "@/logos/image 8 [Vectorized].png";
import type { FooterSection } from "@/components/layout/nav-data";

// Default footer sections (fallback when no managed menu is configured).
const DEFAULT_FOOTER_SECTIONS: FooterSection[] = [
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
      { href: "/shipping-policy", label: "Shipping" },
      { href: "/packing", label: "Packing" },
      { href: "/return-policy", label: "Returns & Refunds" },
      { href: "/how-it-works", label: "Authentication" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms-of-service", label: "Terms of Service" },
    ],
  },
];

export function SiteFooter({ footerSections = DEFAULT_FOOTER_SECTIONS }: { footerSections?: FooterSection[] }) {
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
          <div className="flex items-center gap-4 pt-2">
            <a
              href="mailto:hello@fromthetrunk.com"
              className="text-sm text-muted-foreground transition hover:text-foreground"
            >
              hello@fromthetrunk.com
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="https://www.instagram.com/from.thetrunk/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:border-trunk-gold/50 hover:text-foreground"
              aria-label="Follow From the Trunk on Instagram"
            >
              <Instagram className="h-3.5 w-3.5" />
              Instagram
            </a>
            <a
              href="https://wa.me/919731910202"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:border-trunk-gold/50 hover:text-foreground"
              aria-label="Chat with From the Trunk on WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {footerSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-2 text-sm text-foreground">
                {section.links.map((link) => (
                  <li key={`${section.title}-${link.label}`}>
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
        © {new Date().getFullYear()} From the Trunk. All rights reserved.
      </div>
    </footer>
  );
}
