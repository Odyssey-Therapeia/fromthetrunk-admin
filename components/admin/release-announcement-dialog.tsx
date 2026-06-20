"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Images,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

import { AppVersionBadge } from "@/components/admin/app-version-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type AdminReleaseHighlight,
  type AdminReleaseNote,
} from "@/lib/admin/releases";
import { hasSeenRelease, markReleaseSeen } from "@/lib/admin/release-seen";
import { cn } from "@/lib/utils";

type ReleaseAnnouncementDialogProps = {
  adminId: string;
  release: AdminReleaseNote;
};

const highlightIcons: Record<AdminReleaseHighlight["area"], typeof LayoutGrid> =
  {
    Admin: LayoutGrid,
    Images,
    Quality: ShieldCheck,
    Storefront: Store,
  };

export function ReleaseAnnouncementDialog({
  adminId,
  release,
}: ReleaseAnnouncementDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!release.showAnnouncement) return;

    if (!hasSeenRelease(window.localStorage, adminId, release.version)) {
      const openTimer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(openTimer);
    }
  }, [adminId, release.showAnnouncement, release.version]);

  const closeAndRemember = () => {
    markReleaseSeen(window.localStorage, adminId, release.version);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeAndRemember();
          return;
        }
        setOpen(true);
      }}
    >
      <DialogContent className="@container max-h-[90vh] overflow-hidden border-border/80 bg-card p-0 shadow-2xl @3xl:max-w-3xl">
        <div className="relative overflow-hidden border-b border-border/80 bg-linear-to-br from-card via-muted to-primary px-6 py-7 text-foreground @3xl:px-8">
          <div className="absolute right-0 top-0 h-32 w-40 bg-primary/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <AppVersionBadge release={release} tone="dark" showLabel />
                <span className="rounded-full border border-border/80 bg-background/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {release.releaseDate}
                </span>
              </div>
              <DialogHeader className="space-y-3 text-left">
                <DialogTitle className="font-serif text-3xl font-normal leading-tight tracking-normal @3xl:text-4xl">
                  {release.name}
                </DialogTitle>
                <DialogDescription className="max-w-2xl text-sm leading-6 text-muted-foreground @3xl:text-base">
                  {release.summary}
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="hidden rounded-2xl border border-border/70 bg-background/45 p-3 text-foreground shadow-sm backdrop-blur @3xl:block">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="max-h-[52vh] space-y-5 overflow-y-auto px-6 py-5 @3xl:px-8">
          <div className="grid gap-3 @3xl:grid-cols-2">
            {release.highlights.map((highlight) => {
              const Icon = highlightIcons[highlight.area];

              return (
                <article
                  className={cn(
                    "rounded-xl border border-border/70 bg-background/70 p-4 shadow-sm transition duration-200",
                    "motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md",
                  )}
                  key={`${highlight.area}-${highlight.title}`}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {highlight.area}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {highlight.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {highlight.description}
                  </p>
                </article>
              );
            })}
          </div>

          <section className="rounded-xl border border-border/70 bg-background/70 p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Release notes
            </p>
            <div className="mt-4 grid gap-4 @3xl:grid-cols-3">
              {release.changes.map((group) => (
                <div key={group.title}>
                  <h3 className="text-sm font-semibold text-foreground">
                    {group.title}
                  </h3>
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-6 text-muted-foreground">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter className="border-t border-border/80 bg-background/60 px-6 py-4 @3xl:px-8">
          <Button type="button" variant="outline" onClick={closeAndRemember}>
            Got it
          </Button>
          <Button
            asChild
            type="button"
            className="gap-2"
            onClick={closeAndRemember}
          >
            <Link href={release.demoHref}>
              {release.demoLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
