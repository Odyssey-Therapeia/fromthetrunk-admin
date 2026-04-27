import type { Metadata } from "next";
import Link from "next/link";

import { AppVersionBadge } from "@/components/admin/app-version-badge";
import { Button } from "@/components/ui/button";
import { adminReleases, currentAdminRelease } from "@/lib/admin/releases";

export const metadata: Metadata = {
  title: "Changelog",
};

const releaseDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});

const formatReleaseDate = (releaseDate: string) =>
  releaseDateFormatter.format(new Date(`${releaseDate}T00:00:00.000Z`));

export default function AdminChangelogPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Release history
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            FTT changelog
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Product updates, storefront fixes, and admin workflow changes for
            each version.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={currentAdminRelease.demoHref}>
            {currentAdminRelease.demoLabel}
          </Link>
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card/85 shadow-sm">
        <div className="border-b border-border/70 bg-background/60 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                Current release
              </p>
              <h3 className="mt-1 font-serif text-2xl text-foreground">
                {currentAdminRelease.name}
              </h3>
            </div>
            <AppVersionBadge
              release={currentAdminRelease}
              showLabel
              href={null}
              tone="dark"
            />
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {currentAdminRelease.summary}
          </p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {currentAdminRelease.highlights.map((highlight) => (
            <article
              key={`${highlight.area}-${highlight.title}`}
              className="rounded-xl border border-border/70 bg-background/70 p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {highlight.area}
              </p>
              <h4 className="mt-2 text-sm font-semibold text-foreground">
                {highlight.title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {highlight.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        {adminReleases.map((release) => (
          <article
            key={release.version}
            className="rounded-2xl border border-border/80 bg-card/80 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <AppVersionBadge release={release} href={null} />
                  <time
                    dateTime={release.releaseDate}
                    className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {formatReleaseDate(release.releaseDate)}
                  </time>
                </div>
                <h3 className="mt-3 font-serif text-2xl text-foreground">
                  {release.name}
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {release.summary}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={release.demoHref}>{release.demoLabel}</Link>
              </Button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {release.changes.map((group) => (
                <section
                  key={`${release.version}-${group.title}`}
                  className="rounded-xl border border-border/70 bg-background/65 p-4"
                >
                  <h4 className="text-sm font-semibold text-foreground">
                    {group.title}
                  </h4>
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-6 text-muted-foreground">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
