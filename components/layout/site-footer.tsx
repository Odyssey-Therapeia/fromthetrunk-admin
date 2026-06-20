import Image from "next/image";
import Link from "next/link";
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

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17.2 6.8h.01" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M5 18.2 3.8 22l4-1.1A9 9 0 1 0 5 18.2Z" />
      <path d="M8.7 10.2c.5 1.7 1.9 3 3.4 3.8.8.4 1.5.6 2.2.5.5-.1.9-.6 1.1-1" />
    </svg>
  );
}

export function SiteFooter({
  footerSections = DEFAULT_FOOTER_SECTIONS,
}: {
  footerSections?: FooterSection[];
}) {
  return (
    <footer className="bg-[#3C0C0F] text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-16 md:grid-cols-[1.4fr_2fr]">
        <div className="space-y-4">
          <div className="inline-flex rounded-2xl bg-[#F8F4EF] px-4 py-3">
            <Image
              src={logoMark}
              alt="From the Trunk"
              width={140}
              height={56}
              className="h-12 w-auto"
            />
          </div>
          <p className="max-w-sm text-sm leading-7 text-white/62">
            A curated collection of pre-loved luxury sarees. Each piece is
            authenticated, cherished, and ready for a new story.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <a
              href="mailto:hello@fromthetrunk.shop"
              className="text-sm text-white/62 transition hover:text-white"
            >
              hello@fromthetrunk.shop
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="https://www.instagram.com/from.thetrunk/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/62 transition hover:border-[#AA8657] hover:text-white"
              aria-label="Follow From the Trunk on Instagram"
            >
              <InstagramIcon />
              Instagram
            </a>
            <a
              href="https://wa.me/919731910202"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/62 transition hover:border-[#AA8657] hover:text-white"
              aria-label="Chat with From the Trunk on WhatsApp"
            >
              <ChatIcon />
              WhatsApp
            </a>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {footerSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#AA8657]">
                {section.title}
              </p>
              <ul className="space-y-2 text-sm text-white/62">
                {section.links.map((link) => (
                  <li key={`${section.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="transition hover:text-white hover:underline underline-offset-4"
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
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/62">
        © {new Date().getFullYear()} From the Trunk. All rights reserved.
      </div>
    </footer>
  );
}
