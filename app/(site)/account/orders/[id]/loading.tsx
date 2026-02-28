export default function OrderDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Timeline skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6">
        <div className="h-3 w-20 animate-pulse rounded-full bg-muted mb-4" />
        <div className="flex items-center justify-between">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div className="mt-2 h-2 w-14 animate-pulse rounded-full bg-muted" />
              </div>
              {i < 3 && <div className="mx-2 h-0.5 flex-1 bg-muted" />}
            </div>
          ))}
        </div>
      </div>

      {/* Items skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6">
        <div className="h-5 w-12 animate-pulse rounded-full bg-muted mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
