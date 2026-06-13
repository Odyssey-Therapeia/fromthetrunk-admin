import { Sparkles } from "lucide-react";
import Link from "next/link";

import { currentAdminRelease, type AdminReleaseNote } from "@/lib/admin/releases";
import { cn } from "@/lib/utils";

type AppVersionBadgeProps = {
  className?: string;
  release?: AdminReleaseNote;
  showLabel?: boolean;
  href?: string | null;
  tone?: "cream" | "dark" | "outline";
};

export function AppVersionBadge({
  className,
  release = currentAdminRelease,
  showLabel = false,
  href = "/admin/changelog",
  tone = "cream",
}: AppVersionBadgeProps) {
  const badgeClassName = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition duration-200",
    "motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-sm",
    tone === "cream" &&
      "border-border/80 bg-card/85 text-muted-foreground hover:text-foreground",
    tone === "dark" &&
      "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
    tone === "outline" &&
      "border-border/80 bg-background/70 text-muted-foreground hover:text-foreground",
    className,
  );
  const content = (
    <>
      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {showLabel ? `Version ${release.version}` : `v${release.version}`}
      </span>
    </>
  );

  if (!href) {
    return (
      <span
        aria-label={`From the Trunk admin version ${release.version}`}
        className={badgeClassName}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      aria-label={`Open changelog for From the Trunk admin version ${release.version}`}
      className={badgeClassName}
      href={href}
    >
      {content}
    </Link>
  );
}
