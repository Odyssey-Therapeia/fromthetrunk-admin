import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="@container border-b border-primary-foreground/20 bg-primary px-3 py-2 text-center text-xs text-primary-foreground @sm:px-6">
      <p className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-x-2 gap-y-1 leading-4 tracking-[0.08em] uppercase @sm:flex-row @sm:flex-wrap @sm:tracking-[0.15em]">
        <span>Grand Launch Week</span>
        <span className="hidden @sm:inline" aria-hidden="true">
          •
        </span>
        <span>Complimentary styling consult</span>
        <Link
          href="/collection"
          className="font-semibold text-primary-foreground underline decoration-primary-foreground/70 underline-offset-4 transition hover:opacity-90"
        >
          Explore the Collection
        </Link>
      </p>
    </div>
  );
}
