export default function SearchLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-6 py-16">
      <div className="space-y-4">
        <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-4/5 animate-pulse rounded-2xl bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
