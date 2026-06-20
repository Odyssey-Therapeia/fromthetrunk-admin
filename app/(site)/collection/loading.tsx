export default function CollectionLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-12 lg:space-y-12 lg:py-16">
      {/* Header skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-80 animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Filter bar skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6">
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-64 animate-pulse rounded-xl bg-muted" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-7 w-16 animate-pulse rounded-full bg-muted"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Product grid skeleton */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:gap-6 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 sm:space-y-3">
            <div className="aspect-3/4 sm:aspect-4/5 animate-pulse rounded-xl sm:rounded-2xl bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-1/4 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
