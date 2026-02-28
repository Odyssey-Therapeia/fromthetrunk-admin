export default function AccountLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-3 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-28 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
