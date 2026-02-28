export default function ProductDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 px-6 py-16">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Gallery skeleton */}
        <div className="space-y-4">
          <div className="aspect-[4/5] animate-pulse rounded-3xl bg-muted" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 w-16 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        </div>

        {/* Details skeleton */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-3/4 animate-pulse rounded-xl bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-4/6 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-px bg-border" />
          <div className="h-14 w-full animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
