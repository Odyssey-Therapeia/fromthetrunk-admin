import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="@container border-b border-[#aa8657]/25 bg-[#3c0c0f] px-3 py-2 text-center text-xs text-[#aa8657] @sm:px-6">
      <p className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-x-2 gap-y-1 leading-4 tracking-[0.08em] uppercase @sm:flex-row @sm:flex-wrap @sm:tracking-[0.15em]">
        <span>Grand Launch Week</span>
        <span className="hidden @sm:inline" aria-hidden="true">
          •
        </span>
        <span>Complimentary styling consult</span>
        <Link
          href="/collection"
          className="font-semibold text-white underline decoration-white/70 underline-offset-4 transition hover:text-[#f1dfc3]"
        >
          Explore the Collection
        </Link>
      </p>
    </div>
  );
}
