import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="border-b border-primary-foreground/20 bg-primary px-6 py-2 text-center text-xs text-primary-foreground">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 tracking-[0.15em] uppercase">
        <span>Grand Launch Week • Complimentary styling consult</span>
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
