export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-16">
      {/* Hero skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-4/5 animate-pulse rounded-2xl bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-1/4 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
