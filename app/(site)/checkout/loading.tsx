export default function CheckoutLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-16">
      <div className="space-y-3">
        <div className="h-3 w-16 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-56 animate-pulse rounded-xl bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-3xl border border-border/60 bg-card/70 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
          ))}
          <div className="h-14 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-80 animate-pulse rounded-3xl bg-muted" />
      </div>
    </div>
  );
}
